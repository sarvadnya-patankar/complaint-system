const { escapeHtml } = require("./helpers");

const renderLayout = ({ title, body, extraHead = "", flash = null }) => `<!DOCTYPE html>
<html>
<head>
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="/css/styles.css" />
    <script src="/js/app.js" defer></script>
    ${extraHead}
</head>
<body>
    ${flash ? `<div class="toast toast-${escapeHtml(flash.type || "info")}" role="status" data-toast>${escapeHtml(flash.message)}</div>` : ""}
    ${body}
</body>
</html>`;

const renderNavLink = ({ href, label, active = false, className = "" }) => {
    const classes = [className, active ? "active" : ""].filter(Boolean).join(" ");
    return `<a href="${escapeHtml(href)}"${classes ? ` class="${escapeHtml(classes)}"` : ""}>${escapeHtml(label)}</a>`;
};

const renderCommonFooter = () => `<footer>
            &copy; 2026 Centralized Public Grievance Redress And Monitoring System
        </footer>`;

const renderErrors = ({ error, errors }) => {
    const topError = error
        ? `<section class="message error-message">${escapeHtml(error)}</section>`
        : "";
    const list = Array.isArray(errors) && errors.length > 0
        ? `<section class="message error-message">
                <ul class="error-list">
                    ${errors.map(item => `<li>${escapeHtml(item)}</li>`).join("")}
                </ul>
            </section>`
        : "";
    return `${topError}${list}`;
};

module.exports = {
    renderLayout,
    renderNavLink,
    renderCommonFooter,
    renderErrors
};
