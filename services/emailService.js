const logger = require("./logger");

const APP_URL = process.env.APP_URL || "http://localhost:3000";
const EMAIL_FROM = process.env.EMAIL_FROM || "no-reply@complaint-portal.local";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";

const sendEmail = async ({ to, subject, text, html }) => {
    if (RESEND_API_KEY) {
        const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${RESEND_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from: EMAIL_FROM,
                to: [to],
                subject,
                text,
                html
            })
        });

        if (!response.ok) {
            const payload = await response.text();
            logger.error("email.resend_failed", new Error(payload), { to, subject });
        }
        return;
    }

    // Fallback for local/dev when provider is not configured.
    logger.info("email.dispatch", {
        to,
        from: EMAIL_FROM,
        subject,
        text,
        html
    });
};

const sendVerificationEmail = async (user, token) => {
    const verifyUrl = `${APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
    await sendEmail({
        to: user.email,
        subject: "Verify your Complaint Portal email",
        text: `Hello ${user.name}, verify your email: ${verifyUrl}`
    });
};

const sendPasswordResetEmail = async (user, token) => {
    const resetUrl = `${APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
    await sendEmail({
        to: user.email,
        subject: "Reset your Complaint Portal password",
        text: `Hello ${user.name}, reset your password: ${resetUrl}`
    });
};

const sendTwoFactorCode = async (user, code) => {
    await sendEmail({
        to: user.email,
        subject: "Your Complaint Portal login code",
        text: `Your login verification code is ${code}. It expires in 10 minutes.`
    });
};

module.exports = {
    sendEmail,
    sendVerificationEmail,
    sendPasswordResetEmail,
    sendTwoFactorCode
};
