const escapeHtml = value => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const statusToClass = status => escapeHtml(String(status || "").toLowerCase().replace(/\s+/g, "-"));

const formatDate = value => {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) {
        return "N/A";
    }
    return date.toLocaleDateString();
};

const formatDateTime = value => {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) {
        return "N/A";
    }
    return date.toLocaleString();
};

module.exports = {
    escapeHtml,
    statusToClass,
    formatDate,
    formatDateTime
};
