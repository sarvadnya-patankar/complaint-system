const { renderLayout, renderNavLink, renderCommonFooter } = require("../layout");

const renderHomePage = ({ flash = null } = {}) => renderLayout({
    title: "Centralized Public Grievance Redress System",
    flash,
    body: `<main class="container fade-in">
        <header>
            <h1>Centralized Public Grievance Redress System</h1>
            <nav>
                ${renderNavLink({ href: "/", label: "Home", active: true })}
                ${renderNavLink({ href: "/register", label: "Register" })}
                ${renderNavLink({ href: "/login", label: "Login" })}
                ${renderNavLink({ href: "/track", label: "Track Complaint" })}
            </nav>
        </header>

        <section class="message">
            Welcome to the portal. Submit and track grievances with fast resolution updates.
        </section>

        <section>
            <h2>Quick Links</h2>
            <div class="actions">
                <a class="button" href="/register">Create Account</a>
                <a class="button" href="/login">Sign In</a>
                <a class="button" href="/track">Track by ID</a>
            </div>
        </section>

        ${renderCommonFooter()}
    </main>`
});

module.exports = {
    renderHomePage
};
