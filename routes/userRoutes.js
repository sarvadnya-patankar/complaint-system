const express = require("express");
const bcrypt = require("bcrypt");
const { body, validationResult } = require("express-validator");
const User = require("../models/User");
const { ensureGuest, ensureAuthenticated } = require("../middleware/authMiddleware");
const {
    renderRegisterPage,
    renderLoginPage,
    renderForgotPasswordPage,
    renderResetPasswordPage,
    renderVerifyEmailSentPage,
    renderTwoFactorPage,
    renderSecurityPage
} = require("../views/templates");
const { generateCaptchaChallenge } = require("../utils/captcha");
const { createToken, hashToken, createOtpCode } = require("../utils/authTokens");
const { setFlash, consumeFlash } = require("../utils/flash");
const {
    sendVerificationEmail,
    sendPasswordResetEmail,
    sendTwoFactorCode
} = require("../services/emailService");
const logger = require("../services/logger");
const { STAFF_ROLES, normalizeRole } = require("../constants/roles");

const router = express.Router();

const MAX_FAILED_ATTEMPTS = Number(process.env.MAX_FAILED_ATTEMPTS) || 5;
const LOCKOUT_MINUTES = Number(process.env.LOCKOUT_MINUTES) || 15;
const VERIFICATION_TOKEN_TTL_MS = Number(process.env.VERIFICATION_TOKEN_TTL_MS) || 24 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = Number(process.env.RESET_TOKEN_TTL_MS) || 30 * 60 * 1000;
const TWO_FA_TOKEN_TTL_MS = Number(process.env.TWO_FA_TOKEN_TTL_MS) || 10 * 60 * 1000;
const EMAIL_VERIFICATION_REQUIRED = String(process.env.EMAIL_VERIFICATION_REQUIRED || "true").toLowerCase() === "true";

const isStaffRole = role => STAFF_ROLES.includes(normalizeRole(role));
const routeByRole = role => (isStaffRole(role) ? "/admin" : "/dashboard");
const isEmailVerified = user => user && user.emailVerified !== false;

const makeCaptcha = req => {
    const { question, answer } = generateCaptchaChallenge();
    req.session.loginCaptchaAnswer = answer;
    req.session.loginCaptchaQuestion = question;
    return question;
};

const getLoginLockMessage = user => {
    if (!user || !user.lockUntil) {
        return "";
    }
    const now = Date.now();
    if (new Date(user.lockUntil).getTime() <= now) {
        return "";
    }
    const minutesLeft = Math.ceil((new Date(user.lockUntil).getTime() - now) / 60000);
    return `Account temporarily locked. Try again in ${minutesLeft} minute(s).`;
};

const renderRegister = (req, res, options = {}) => {
    const { status = 200, error = null, errors = [], formData = {} } = options;
    return res.status(status).send(renderRegisterPage({
        csrfToken: req.csrfToken(),
        error,
        errors,
        formData,
        flash: consumeFlash(req)
    }));
};

const renderLogin = (req, res, options = {}) => {
    const { status = 200, error = null, errors = [], formData = {}, user = null } = options;
    const captchaQuestion = req.session.loginCaptchaQuestion || makeCaptcha(req);
    return res.status(status).send(renderLoginPage({
        csrfToken: req.csrfToken(),
        error,
        errors,
        formData,
        captchaQuestion,
        lockMessage: getLoginLockMessage(user),
        emailVerificationRequired: EMAIL_VERIFICATION_REQUIRED,
        flash: consumeFlash(req)
    }));
};

const renderForgotPassword = (req, res, options = {}) => {
    const { status = 200, error = null, errors = [] } = options;
    return res.status(status).send(renderForgotPasswordPage({
        csrfToken: req.csrfToken(),
        error,
        errors,
        flash: consumeFlash(req)
    }));
};

const renderResetPassword = (req, res, options = {}) => {
    const { status = 200, error = null, errors = [], token = req.query.token || req.body.token || "" } = options;
    return res.status(status).send(renderResetPasswordPage({
        csrfToken: req.csrfToken(),
        token,
        error,
        errors,
        flash: consumeFlash(req)
    }));
};

const renderTwoFactor = (req, res, options = {}) => {
    const { status = 200, error = null, errors = [] } = options;
    return res.status(status).send(renderTwoFactorPage({
        csrfToken: req.csrfToken(),
        error,
        errors,
        flash: consumeFlash(req)
    }));
};

const createEmailVerificationToken = async user => {
    const token = createToken(24);
    user.emailVerificationTokenHash = hashToken(token);
    user.emailVerificationExpiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);
    await user.save();
    return token;
};

const createPasswordResetToken = async user => {
    const token = createToken(24);
    user.passwordResetTokenHash = hashToken(token);
    user.passwordResetExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await user.save();
    return token;
};

const resetFailedLoginState = async user => {
    if (!user.failedLoginAttempts && !user.lockUntil) {
        return;
    }
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();
};

const registerFailedLoginAttempt = async user => {
    if (!user) {
        return;
    }
    const now = Date.now();
    if (user.lockUntil && new Date(user.lockUntil).getTime() > now) {
        return;
    }

    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
        user.lockUntil = new Date(now + LOCKOUT_MINUTES * 60 * 1000);
        user.failedLoginAttempts = 0;
    }
    await user.save();
};

const completeLogin = (req, res, user) => {
    req.session.regenerate(err => {
        if (err) {
            logger.error("auth.session_regenerate_error", err, { email: user.email });
            return renderLogin(req, res, {
                status: 500,
                error: "Unable to login right now",
                formData: { email: user.email }
            });
        }

        req.session.userId = String(user._id);
        req.session.role = normalizeRole(user.role);
        req.session.username = user.name;
        req.session.department = user.department || "General";
        return res.redirect(routeByRole(user.role));
    });
};

router.get("/register", ensureGuest, (req, res) => {
    renderRegister(req, res);
});

router.get("/login", ensureGuest, (req, res) => {
    makeCaptcha(req);
    renderLogin(req, res);
});

router.get("/verify-email/sent", ensureGuest, (req, res) => {
    res.status(200).send(renderVerifyEmailSentPage({ flash: consumeFlash(req) }));
});

router.get("/forgot-password", ensureGuest, (req, res) => {
    renderForgotPassword(req, res);
});

router.get("/reset-password", ensureGuest, async (req, res) => {
    const token = req.query.token;
    if (!token) {
        return renderResetPassword(req, res, { status: 400, error: "Invalid reset token" });
    }

    const tokenHash = hashToken(token);
    const user = await User.findOne({
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: { $gt: new Date() }
    });

    if (!user) {
        return renderResetPassword(req, res, { status: 400, error: "Reset token is invalid or expired", token });
    }

    return renderResetPassword(req, res, { token });
});

router.get("/verify-email", ensureGuest, async (req, res) => {
    const token = req.query.token;
    if (!token) {
        setFlash(req, "error", "Invalid verification link");
        return res.redirect("/login");
    }

    const user = await User.findOne({
        emailVerificationTokenHash: hashToken(token),
        emailVerificationExpiresAt: { $gt: new Date() }
    });

    if (!user) {
        setFlash(req, "error", "Verification link is invalid or expired");
        return res.redirect("/login");
    }

    user.emailVerified = true;
    user.emailVerificationTokenHash = null;
    user.emailVerificationExpiresAt = null;
    await user.save();

    setFlash(req, "success", "Email verified. You can now log in.");
    return res.redirect("/login");
});

router.get("/2fa", (req, res) => {
    if (!req.session.pendingAuth?.userId) {
        setFlash(req, "error", "2FA session not found. Please login again.");
        return res.redirect("/login");
    }
    return renderTwoFactor(req, res);
});

router.get("/security", ensureAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);
    if (!user) {
        req.session.destroy(() => {});
        return res.redirect("/login");
    }
    return res.send(renderSecurityPage({
        csrfToken: req.csrfToken(),
        security: {
            emailVerified: user.emailVerified,
            twoFactorEnabled: user.twoFactorEnabled
        },
        flash: consumeFlash(req)
    }));
});

router.post(
    "/register",
    ensureGuest,
    [
        body("name").trim().notEmpty().withMessage("Name is required"),
        body("email").trim().isEmail().withMessage("Invalid email"),
        body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters")
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return renderRegister(req, res, {
                status: 400,
                errors: errors.array().map(item => item.msg),
                formData: { name: req.body.name, email: req.body.email }
            });
        }

        const { name, email, password } = req.body;

        try {
            const userExists = await User.findOne({ email });
            if (userExists) {
                return renderRegister(req, res, {
                    status: 400,
                    error: "An account with this email already exists",
                    formData: { name, email }
                });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            const newUser = new User({
                name,
                email,
                password: hashedPassword,
                emailVerified: !EMAIL_VERIFICATION_REQUIRED
            });
            await newUser.save();

            if (EMAIL_VERIFICATION_REQUIRED) {
                const token = await createEmailVerificationToken(newUser);
                await sendVerificationEmail(newUser, token);
                setFlash(req, "success", "Account created. Please verify your email before login.");
                return res.redirect("/verify-email/sent");
            }

            setFlash(req, "success", "Account created successfully. You can now log in.");
            return res.redirect("/login");
        } catch (error) {
            logger.error("auth.register_error", error, { email });
            return renderRegister(req, res, {
                status: 500,
                error: "Unable to complete registration right now",
                formData: { name, email }
            });
        }
    }
);

router.post(
    "/login",
    ensureGuest,
    [
        body("email").trim().isEmail().withMessage("Invalid email"),
        body("password").notEmpty().withMessage("Password is required"),
        body("captchaAnswer").trim().notEmpty().withMessage("CAPTCHA answer is required")
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            makeCaptcha(req);
            return renderLogin(req, res, {
                status: 400,
                errors: errors.array().map(item => item.msg),
                formData: { email: req.body.email }
            });
        }

        const { email, password, captchaAnswer } = req.body;
        const sessionCaptcha = req.session.loginCaptchaAnswer;
        makeCaptcha(req);

        if (!sessionCaptcha || captchaAnswer !== sessionCaptcha) {
            return renderLogin(req, res, {
                status: 400,
                error: "Invalid CAPTCHA answer",
                formData: { email }
            });
        }

        try {
            const user = await User.findOne({ email });

            if (user && user.lockUntil && new Date(user.lockUntil).getTime() > Date.now()) {
                return renderLogin(req, res, {
                    status: 423,
                    error: "Account temporarily locked due to repeated failed logins",
                    formData: { email },
                    user
                });
            }

            const isValidUser = user ? await bcrypt.compare(password, user.password) : false;

            if (!isValidUser) {
                await registerFailedLoginAttempt(user);
                return renderLogin(req, res, {
                    status: 401,
                    error: "Invalid email or password",
                    formData: { email },
                    user
                });
            }

            await resetFailedLoginState(user);

            if (EMAIL_VERIFICATION_REQUIRED && !isEmailVerified(user)) {
                return renderLogin(req, res, {
                    status: 403,
                    error: "Please verify your email before logging in.",
                    formData: { email }
                });
            }

            if (user.twoFactorEnabled) {
                const code = createOtpCode();
                user.twoFactorCodeHash = hashToken(code);
                user.twoFactorCodeExpiresAt = new Date(Date.now() + TWO_FA_TOKEN_TTL_MS);
                await user.save();
                await sendTwoFactorCode(user, code);

                req.session.pendingAuth = {
                    userId: String(user._id),
                    role: normalizeRole(user.role),
                    username: user.name
                };

                setFlash(req, "success", "Verification code sent to your email.");
                return res.redirect("/2fa");
            }

            return completeLogin(req, res, user);
        } catch (error) {
            logger.error("auth.login_error", error, { email });
            return renderLogin(req, res, {
                status: 500,
                error: "Unable to login right now",
                formData: { email }
            });
        }
    }
);

router.post("/2fa/verify", async (req, res) => {
    const pending = req.session.pendingAuth;
    if (!pending?.userId) {
        setFlash(req, "error", "2FA session expired. Please login again.");
        return res.redirect("/login");
    }

    const { code } = req.body;
    if (!code) {
        return renderTwoFactor(req, res, { status: 400, error: "Code is required" });
    }

    const user = await User.findById(pending.userId);
    if (!user) {
        req.session.pendingAuth = null;
        setFlash(req, "error", "User not found. Please login again.");
        return res.redirect("/login");
    }

    const codeHash = hashToken(code);
    const isCodeValid = user.twoFactorCodeHash === codeHash
        && user.twoFactorCodeExpiresAt
        && new Date(user.twoFactorCodeExpiresAt).getTime() > Date.now();

    if (!isCodeValid) {
        return renderTwoFactor(req, res, { status: 401, error: "Invalid or expired verification code" });
    }

    user.twoFactorCodeHash = null;
    user.twoFactorCodeExpiresAt = null;
    await user.save();

    req.session.regenerate(err => {
        if (err) {
            logger.error("auth.2fa_session_regenerate_error", err, { userId: user._id });
            return renderTwoFactor(req, res, { status: 500, error: "Could not complete login" });
        }

        req.session.userId = String(user._id);
        req.session.role = normalizeRole(user.role);
        req.session.username = user.name;
        req.session.department = user.department || "General";
        setFlash(req, "success", "Two-factor authentication verified.");
        return res.redirect(routeByRole(user.role));
    });
});

router.post(
    "/forgot-password",
    ensureGuest,
    [body("email").trim().isEmail().withMessage("Enter a valid email")],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return renderForgotPassword(req, res, {
                status: 400,
                errors: errors.array().map(item => item.msg)
            });
        }

        const { email } = req.body;
        const user = await User.findOne({ email });
        if (user) {
            const resetToken = await createPasswordResetToken(user);
            await sendPasswordResetEmail(user, resetToken);
        }

        setFlash(req, "success", "If the account exists, a reset link has been sent.");
        return res.redirect("/login");
    }
);

router.post(
    "/reset-password",
    ensureGuest,
    [
        body("token").trim().notEmpty().withMessage("Missing reset token"),
        body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
        body("confirmPassword")
            .custom((value, { req }) => value === req.body.password)
            .withMessage("Passwords do not match")
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return renderResetPassword(req, res, {
                status: 400,
                errors: errors.array().map(item => item.msg),
                token: req.body.token
            });
        }

        const user = await User.findOne({
            passwordResetTokenHash: hashToken(req.body.token),
            passwordResetExpiresAt: { $gt: new Date() }
        });

        if (!user) {
            return renderResetPassword(req, res, {
                status: 400,
                error: "Reset token is invalid or expired",
                token: req.body.token
            });
        }

        user.password = await bcrypt.hash(req.body.password, 10);
        user.passwordResetTokenHash = null;
        user.passwordResetExpiresAt = null;
        await user.save();

        setFlash(req, "success", "Password reset successful. Please login.");
        return res.redirect("/login");
    }
);

router.post("/verify-email/resend", ensureAuthenticated, async (req, res) => {
    if (!EMAIL_VERIFICATION_REQUIRED) {
        setFlash(req, "info", "Email verification is currently disabled.");
        return res.redirect("/security");
    }

    const user = await User.findById(req.session.userId);
    if (!user) {
        req.session.destroy(() => {});
        return res.redirect("/login");
    }

    if (isEmailVerified(user)) {
        setFlash(req, "info", "Email is already verified.");
        return res.redirect("/security");
    }

    const token = await createEmailVerificationToken(user);
    await sendVerificationEmail(user, token);
    setFlash(req, "success", "Verification email sent again.");
    return res.redirect("/security");
});

router.post(
    "/verify-email/resend-public",
    ensureGuest,
    [body("email").trim().isEmail().withMessage("Enter a valid email")],
    async (req, res) => {
        if (!EMAIL_VERIFICATION_REQUIRED) {
            setFlash(req, "info", "Email verification is currently disabled.");
            return res.redirect("/login");
        }

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return renderLogin(req, res, {
                status: 400,
                errors: errors.array().map(item => item.msg),
                formData: { email: req.body.email }
            });
        }

        const email = req.body.email.trim();
        const user = await User.findOne({ email });
        if (user && !isEmailVerified(user)) {
            const token = await createEmailVerificationToken(user);
            await sendVerificationEmail(user, token);
        }

        setFlash(req, "success", "If this account exists and is unverified, a verification link has been sent.");
        return res.redirect("/login");
    }
);

router.post("/security/2fa/enable", ensureAuthenticated, async (req, res) => {
    await User.findByIdAndUpdate(req.session.userId, { twoFactorEnabled: true });
    setFlash(req, "success", "Two-factor authentication enabled.");
    return res.redirect("/security");
});

router.post("/security/2fa/disable", ensureAuthenticated, async (req, res) => {
    await User.findByIdAndUpdate(req.session.userId, {
        twoFactorEnabled: false,
        twoFactorCodeHash: null,
        twoFactorCodeExpiresAt: null
    });
    setFlash(req, "success", "Two-factor authentication disabled.");
    return res.redirect("/security");
});

router.get("/logout", ensureAuthenticated, (req, res) => {
    req.session.destroy(err => {
        if (err) {
            logger.error("auth.logout_error", err, { userId: req.session?.userId });
            return res.status(500).send("Logout failed");
        }

        res.clearCookie("connect.sid");
        return res.redirect("/login");
    });
});

module.exports = router;
