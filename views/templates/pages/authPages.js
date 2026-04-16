const { escapeHtml } = require("../helpers");
const { renderLayout, renderNavLink, renderErrors } = require("../layout");

const renderRegisterPage = ({ csrfToken, error = null, errors = [], formData = {}, flash = null }) => renderLayout({
    title: "Register - Complaint Portal",
    flash,
    body: `<main class="container fade-in">
        <header>
            <h1>Register</h1>
            <nav>
                ${renderNavLink({ href: "/", label: "Home" })}
                ${renderNavLink({ href: "/register", label: "Register", active: true })}
                ${renderNavLink({ href: "/login", label: "Login" })}
            </nav>
        </header>

        ${renderErrors({ error, errors })}

        <form action="/register" method="POST" data-enhanced-form>
            <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
            <label for="name">Name</label>
            <input id="name" type="text" name="name" value="${escapeHtml(formData.name || "")}" required data-inline-validate>

            <label for="email">Email</label>
            <input id="email" type="email" name="email" value="${escapeHtml(formData.email || "")}" required data-inline-validate>

            <label for="password">Password</label>
            <input id="password" type="password" name="password" required minlength="8" data-inline-validate>
            <small style="color:#526699;">Use at least 8 characters for better account security.</small>

            <button type="submit" data-loading-text="Registering...">Register</button>
        </form>

        <footer>
            <p>Already registered? <a href="/login">Login</a></p>
        </footer>
    </main>`
});

const renderLoginPage = ({
    csrfToken,
    error = null,
    errors = [],
    formData = {},
    captchaQuestion = "",
    lockMessage = "",
    emailVerificationRequired = true,
    flash = null
}) => renderLayout({
    title: "Login - Complaint Portal",
    flash,
    body: `<main class="container fade-in">
        <header>
            <h1>Login</h1>
            <nav>
                ${renderNavLink({ href: "/", label: "Home" })}
                ${renderNavLink({ href: "/register", label: "Register" })}
                ${renderNavLink({ href: "/login", label: "Login", active: true })}
            </nav>
        </header>

        ${lockMessage ? `<section class="message error-message">${escapeHtml(lockMessage)}</section>` : ""}
        ${renderErrors({ error, errors })}

        <form action="/login" method="POST" data-enhanced-form>
            <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
            <label for="email">Email</label>
            <input id="email" type="email" name="email" value="${escapeHtml(formData.email || "")}" required data-inline-validate>

            <label for="password">Password</label>
            <input id="password" type="password" name="password" required data-inline-validate>

            <label for="captchaAnswer">CAPTCHA: ${escapeHtml(captchaQuestion)}</label>
            <input id="captchaAnswer" type="text" name="captchaAnswer" required data-inline-validate>

            <button type="submit" data-loading-text="Signing in...">Login</button>
        </form>

        <footer>
            <p>Don&apos;t have an account? <a href="/register">Register now</a></p>
            <p><a href="/forgot-password">Forgot your password?</a></p>
            ${emailVerificationRequired ? `<form action="/verify-email/resend-public" method="POST" class="inline-mini-form" data-enhanced-form>
                <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
                <input type="email" name="email" placeholder="Email for verification link" value="${escapeHtml(formData.email || "")}" required>
                <button type="submit" data-loading-text="Sending...">Resend Verification Email</button>
            </form>` : ""}
        </footer>
    </main>`
});

const renderForgotPasswordPage = ({ csrfToken, errors = [], error = null, flash = null }) => renderLayout({
    title: "Forgot Password",
    flash,
    body: `<main class="container fade-in">
        <header>
            <h1>Forgot Password</h1>
            <nav>
                ${renderNavLink({ href: "/", label: "Home" })}
                ${renderNavLink({ href: "/login", label: "Login" })}
            </nav>
        </header>

        <section class="message">Enter your email to receive a password reset link.</section>
        ${renderErrors({ error, errors })}

        <form action="/forgot-password" method="POST" data-enhanced-form>
            <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
            <label for="email">Email</label>
            <input id="email" type="email" name="email" required data-inline-validate>
            <button type="submit" data-loading-text="Sending...">Send Reset Link</button>
        </form>
    </main>`
});

const renderResetPasswordPage = ({ csrfToken, token, errors = [], error = null, flash = null }) => renderLayout({
    title: "Reset Password",
    flash,
    body: `<main class="container fade-in">
        <header>
            <h1>Reset Password</h1>
            <nav>
                ${renderNavLink({ href: "/", label: "Home" })}
                ${renderNavLink({ href: "/login", label: "Login" })}
            </nav>
        </header>

        ${renderErrors({ error, errors })}
        <form action="/reset-password" method="POST" data-enhanced-form>
            <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
            <input type="hidden" name="token" value="${escapeHtml(token)}">

            <label for="password">New Password</label>
            <input id="password" type="password" name="password" minlength="8" required data-inline-validate>

            <label for="confirmPassword">Confirm Password</label>
            <input id="confirmPassword" type="password" name="confirmPassword" minlength="8" required data-inline-validate>

            <button type="submit" data-loading-text="Resetting...">Reset Password</button>
        </form>
    </main>`
});

const renderVerifyEmailSentPage = ({ flash = null }) => renderLayout({
    title: "Verify Email",
    flash,
    body: `<main class="container fade-in">
        <header>
            <h1>Verify Your Email</h1>
            <nav>
                ${renderNavLink({ href: "/", label: "Home" })}
                ${renderNavLink({ href: "/login", label: "Login" })}
            </nav>
        </header>
        <section class="message">
            We have sent a verification link. Please check your inbox and verify your account before logging in.
        </section>
    </main>`
});

const renderTwoFactorPage = ({ csrfToken, flash = null, error = null, errors = [] }) => renderLayout({
    title: "Two-Factor Verification",
    flash,
    body: `<main class="container fade-in">
        <header>
            <h1>Two-Factor Verification</h1>
        </header>
        <section class="message">Enter the 6-digit code sent to your email.</section>
        ${renderErrors({ error, errors })}
        <form action="/2fa/verify" method="POST" data-enhanced-form>
            <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
            <label for="code">Verification Code</label>
            <input id="code" type="text" name="code" pattern="[0-9]{6}" maxlength="6" required data-inline-validate>
            <button type="submit" data-loading-text="Verifying...">Verify</button>
        </form>
    </main>`
});

const renderNotFoundPage = ({ message, flash = null }) => renderLayout({
    title: "404 - Not Found",
    flash,
    body: `<main class="container">
        <header>
            <h1>404 - Not Found</h1>
            <a href="/" class="button">Go Home</a>
        </header>
        <p>${escapeHtml(message)}</p>
    </main>`
});

module.exports = {
    renderRegisterPage,
    renderLoginPage,
    renderForgotPasswordPage,
    renderResetPasswordPage,
    renderVerifyEmailSentPage,
    renderTwoFactorPage,
    renderNotFoundPage
};
