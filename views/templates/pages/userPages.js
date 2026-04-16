const { escapeHtml, formatDateTime, statusToClass } = require("../helpers");
const { renderLayout, renderNavLink, renderCommonFooter, renderErrors } = require("../layout");

const toJsonAttr = value => escapeHtml(JSON.stringify(value || []));

const renderPagination = pagination => {
    if (!pagination || pagination.totalPages <= 1) {
        return "";
    }
    return `<div class="pagination">
        <span>Page ${pagination.page} of ${pagination.totalPages} (${pagination.total} total)</span>
        <div class="actions">
            ${pagination.hasPrev ? `<a class="button" href="${escapeHtml(pagination.prevLink)}">Prev</a>` : ""}
            ${pagination.hasNext ? `<a class="button" href="${escapeHtml(pagination.nextLink)}">Next</a>` : ""}
        </div>
    </div>`;
};

const renderComplaintPage = ({
    csrfToken,
    errors = [],
    formData = {},
    isStaff = false,
    departments = [],
    flash = null
}) => renderLayout({
    title: "Submit Complaint",
    flash,
    body: `<main class="container fade-in">
        <header>
            <h1>Submit New Complaint</h1>
            <nav>
                ${renderNavLink({ href: "/dashboard", label: "Dashboard" })}
                ${renderNavLink({ href: "/complaint", label: "New Complaint", active: true })}
                ${isStaff ? renderNavLink({ href: "/admin", label: "Admin Panel" }) : ""}
                ${renderNavLink({ href: "/security", label: "Security" })}
                ${renderNavLink({ href: "/track", label: "Track Complaint" })}
                ${renderNavLink({ href: "/logout", label: "Logout" })}
            </nav>
        </header>

        ${renderErrors({ errors })}

        <form action="/complaint" method="POST" enctype="multipart/form-data" data-enhanced-form>
            <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
            <label for="title">Title</label>
            <input id="title" type="text" name="title" value="${escapeHtml(formData.title || "")}" required data-inline-validate>

            <label for="description">Description</label>
            <textarea id="description" name="description" required data-inline-validate>${escapeHtml(formData.description || "")}</textarea>

            <label for="category">Category</label>
            <input id="category" type="text" name="category" value="${escapeHtml(formData.category || "")}" required data-inline-validate>

            <label for="priority">Priority</label>
            <select id="priority" name="priority" required data-inline-validate>
                <option value="Low"${(formData.priority || "") === "Low" ? " selected" : ""}>Low</option>
                <option value="Medium"${(formData.priority || "") === "Medium" ? " selected" : ""}>Medium</option>
                <option value="High"${(formData.priority || "") === "High" ? " selected" : ""}>High</option>
            </select>

            <label for="assignedDepartment">Department</label>
            <select id="assignedDepartment" name="assignedDepartment">
                ${departments.map(dep => `<option value="${escapeHtml(dep)}"${(formData.assignedDepartment || "") === dep ? " selected" : ""}>${escapeHtml(dep)}</option>`).join("")}
            </select>

            <label for="attachments">Evidence Attachments (JPG/PNG/PDF, max 5 files, 5MB each)</label>
            <input id="attachments" type="file" name="attachments" accept=".jpg,.jpeg,.png,.pdf" multiple>

            <button type="submit" data-loading-text="Submitting...">Submit Complaint</button>
        </form>

        <footer>
            <p>View your complaints on <a href="/dashboard">Dashboard</a>.</p>
        </footer>
    </main>`
});

const renderAttachmentLinks = complaint => {
    if (!complaint.attachments || complaint.attachments.length === 0) {
        return "";
    }
    return `<div style="margin-top:0.6rem;">
        <strong>Attachments:</strong>
        <ul>
            ${complaint.attachments.map(file => `<li>
                <a href="/complaint/${escapeHtml(String(complaint._id))}/attachment/${escapeHtml(file.fileName)}">${escapeHtml(file.originalName)}</a>
            </li>`).join("")}
        </ul>
    </div>`;
};

const renderDashboardCards = (complaints, csrfToken) => {
    if (!complaints || complaints.length === 0) {
        return `<section class="empty-state">
                <h4>No complaints found</h4>
                <p>Try changing filters or create your first complaint now.</p>
                <a class="button" href="/complaint">Create Complaint</a>
            </section>`;
    }

    return complaints.map(complaint => {
        const dueAt = complaint.slaDueAt ? new Date(complaint.slaDueAt) : null;
        const isOverdue = dueAt && dueAt < new Date() && complaint.status !== "Resolved";
        const latestNotification = complaint.notificationsSent && complaint.notificationsSent.length > 0
            ? complaint.notificationsSent[complaint.notificationsSent.length - 1]
            : null;

        return `${isOverdue ? `<div class="notification-alert">
                    <strong>SLA Alert:</strong> This complaint is overdue since ${escapeHtml(formatDateTime(dueAt))}
                </div>` : ""}
            <article class="card">
                <div style="display:flex;justify-content:space-between;align-items:start;gap:0.5rem;flex-wrap:wrap;">
                    <strong>${escapeHtml(complaint.title)}</strong>
                    <span class="pill status-${statusToClass(complaint.status)}">${escapeHtml(complaint.status)}</span>
                </div>
                <p class="card-meta">
                    <span class="pill">Tracking ID: ${escapeHtml(complaint.publicTrackingId || "N/A")}</span>
                    <span class="pill">Category: ${escapeHtml(complaint.category)}</span>
                    <span class="pill">Department: ${escapeHtml(complaint.assignedDepartment || "General")}</span>
                    <span class="pill">Priority: ${escapeHtml(complaint.priority)}</span>
                    ${dueAt ? `<span class="pill ${isOverdue ? "danger" : "warning"}">SLA Due: ${escapeHtml(formatDateTime(dueAt))}</span>` : ""}
                </p>
                <p>${escapeHtml(complaint.description)}</p>
                ${renderAttachmentLinks(complaint)}
                <div class="actions">
                    <a class="button" href="/complaint/${escapeHtml(String(complaint._id))}/history">History & Comments</a>
                    <form action="/complaint/${escapeHtml(String(complaint._id))}/delete" method="POST" data-enhanced-form>
                        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
                        <button type="submit" class="button button-danger" onclick="return confirm('Are you sure?')" data-loading-text="Deleting...">Delete</button>
                    </form>
                </div>
                ${complaint.adminRemark ? `<p style="margin-top:0.8rem;padding-top:0.8rem;border-top:1px solid #dbe4f3;">
                    <strong>Admin Remark:</strong> ${escapeHtml(complaint.adminRemark)}
                </p>` : ""}
                ${latestNotification ? `<p style="margin-top:0.8rem;font-size:0.85rem;color:#526699;">
                    Last notification: ${escapeHtml(formatDateTime(latestNotification.sentAt))}
                </p>` : ""}
            </article>`;
    }).join("");
};

const renderDashboardPage = ({
    complaints,
    csrfToken,
    isStaff = false,
    searchApplied = false,
    filters = {},
    listOptions = {},
    pagination = null,
    chartData = {},
    flash = null
}) => renderLayout({
    title: "User Dashboard",
    flash,
    extraHead: `<style>
        .search-filters { background:#f8faff;border:1px solid #dde8f8;border-radius:12px;padding:1.5rem;margin-bottom:1.5rem; }
        .search-filters h3 { margin-top:0;color:#162a6b;margin-bottom:1rem; }
        .filter-grid { display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1rem;margin-bottom:1rem; }
        .filter-grid input,.filter-grid select { width:100%;padding:0.7rem 0.85rem;border:1px solid #cbd7ee;border-radius:8px;font-size:0.9rem; }
        .notification-alert { background:#fff5e3;border-left:4px solid #ff9800;padding:1rem;margin-bottom:1rem;border-radius:8px;display:flex;gap:0.75rem;align-items:center; }
        .chart-grid { display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:1rem;margin-bottom:1rem; }
        .pagination { margin-top:1rem;display:flex;justify-content:space-between;align-items:center;gap:0.8rem;flex-wrap:wrap; }
    </style>
    <script src="/js/charts.js" defer></script>`,
    body: `<main class="container fade-in">
        <header>
            <h1>My Complaints</h1>
            <nav>
                ${renderNavLink({ href: "/dashboard", label: "Dashboard", active: true })}
                ${renderNavLink({ href: "/complaint", label: "New Complaint" })}
                ${isStaff ? renderNavLink({ href: "/admin", label: "Admin Panel" }) : ""}
                ${renderNavLink({ href: "/security", label: "Security" })}
                ${renderNavLink({ href: "/track", label: "Track Complaint" })}
                ${renderNavLink({ href: "/logout", label: "Logout" })}
            </nav>
        </header>

        <section class="message">
            Manage your complaints, attachments, and status updates.
        </section>

        <div class="chart-grid">
            <article class="card">
                <h3>Status Distribution</h3>
                <canvas class="chart-canvas" data-chart-type="bar" data-chart-label="Status" data-chart-data="${toJsonAttr(chartData.statusStats || [])}"></canvas>
            </article>
            <article class="card">
                <h3>Monthly Trend (Last 6 Months)</h3>
                <canvas class="chart-canvas" data-chart-type="line" data-chart-label="Complaints" data-chart-data="${toJsonAttr(chartData.monthlyTrend || [])}"></canvas>
            </article>
        </div>

        <div class="search-filters">
            <h3>Search, Sort & Filter</h3>
            <form action="/dashboard/search" method="POST" data-enhanced-form>
                <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
                <div class="filter-grid">
                    <input type="text" name="title" placeholder="Search by title..." value="${escapeHtml(filters.title || "")}">
                    <input type="text" name="category" placeholder="Filter by category..." value="${escapeHtml(filters.category || "")}">
                    <select name="status">
                        <option value="">-- All Status --</option>
                        <option${filters.status === "Pending" ? " selected" : ""}>Pending</option>
                        <option${filters.status === "In Progress" ? " selected" : ""}>In Progress</option>
                        <option${filters.status === "Resolved" ? " selected" : ""}>Resolved</option>
                    </select>
                    <select name="sortBy">
                        <option value="date"${listOptions.sortBy === "date" ? " selected" : ""}>Sort by Date</option>
                        <option value="priority"${listOptions.sortBy === "priority" ? " selected" : ""}>Sort by Priority</option>
                        <option value="status"${listOptions.sortBy === "status" ? " selected" : ""}>Sort by Status</option>
                        <option value="slaDueAt"${listOptions.sortBy === "slaDueAt" ? " selected" : ""}>Sort by SLA</option>
                    </select>
                    <select name="order">
                        <option value="desc"${listOptions.order === "desc" ? " selected" : ""}>Descending</option>
                        <option value="asc"${listOptions.order === "asc" ? " selected" : ""}>Ascending</option>
                    </select>
                    <select name="limit">
                        <option value="10"${Number(listOptions.limit) === 10 ? " selected" : ""}>10 / page</option>
                        <option value="20"${Number(listOptions.limit) === 20 ? " selected" : ""}>20 / page</option>
                        <option value="30"${Number(listOptions.limit) === 30 ? " selected" : ""}>30 / page</option>
                    </select>
                </div>
                <div class="actions">
                    <button type="submit" class="button" data-loading-text="Searching...">Apply</button>
                    ${searchApplied ? '<a href="/dashboard" class="button" style="background:#e8efff;color:#3366ff;border:1px solid #d0dbf9;">Clear</a>' : ""}
                </div>
            </form>
        </div>

        <h3>All Complaints</h3>
        ${renderDashboardCards(complaints, csrfToken)}
        ${renderPagination(pagination)}

        ${renderCommonFooter()}
    </main>`
});

const renderCommentList = complaint => {
    if (!complaint.comments || complaint.comments.length === 0) {
        return "<p>No comments yet.</p>";
    }

    return `<ul class="timeline">
        ${complaint.comments.slice().reverse().map(comment => `<li class="timeline-item fade-in">
            <div class="timeline-dot"></div>
            <div>
                <strong>${escapeHtml(comment.authorName || "User")}</strong>
                <span class="pill">${escapeHtml(comment.authorRole || "user")}</span>
                <small>(${escapeHtml(formatDateTime(comment.createdAt))})</small>
                <p>${escapeHtml(comment.message)}</p>
            </div>
        </li>`).join("")}
    </ul>`;
};

const renderComplaintHistoryPage = ({ complaint, flash = null, isStaff = false, csrfToken }) => {
    const logs = Array.isArray(complaint.statusLogs) ? complaint.statusLogs.slice().reverse() : [];
    const timeline = logs.length > 0
        ? `<ul class="timeline">
                ${logs.map(log => `<li class="timeline-item fade-in">
                        <div class="timeline-dot"></div>
                        <div>
                            <strong>${escapeHtml(log.status)}</strong> <small>(${escapeHtml(formatDateTime(log.updatedAt))})</small><br>
                            <span class="pill">${escapeHtml(log.updatedBy || "system")}</span>
                            <p>${escapeHtml(log.remark || "No remark provided.")}</p>
                        </div>
                    </li>`).join("")}
            </ul>`
        : "<p>No history entries available.</p>";

    return renderLayout({
        title: "Complaint History",
        flash,
        body: `<main class="container fade-in">
        <header>
            <h1>Complaint History</h1>
            <nav>
                ${renderNavLink({ href: "/dashboard", label: "Dashboard" })}
                ${isStaff ? renderNavLink({ href: "/admin", label: "Admin Panel" }) : ""}
                ${renderNavLink({ href: "/logout", label: "Logout" })}
            </nav>
        </header>

        <section class="message">
            <strong>${escapeHtml(complaint.title)}</strong><br>
            Tracking ID: <strong>${escapeHtml(complaint.publicTrackingId || "N/A")}</strong><br>
            Status: <span class="pill status-${statusToClass(complaint.status)}">${escapeHtml(complaint.status)}</span>
        </section>

        <article class="card">
            <h3>Details</h3>
            <p><strong>Description:</strong> ${escapeHtml(complaint.description)}</p>
            <p><strong>Category:</strong> ${escapeHtml(complaint.category)}</p>
            <p><strong>Department:</strong> ${escapeHtml(complaint.assignedDepartment || "General")}</p>
            <p><strong>Priority:</strong> ${escapeHtml(complaint.priority)}</p>
            <p><strong>SLA Due:</strong> ${escapeHtml(formatDateTime(complaint.slaDueAt))}</p>
            <p><strong>Assigned To:</strong> ${escapeHtml(complaint.assignedTo?.name || "Unassigned")}</p>
            <p><strong>Admin Remark:</strong> ${escapeHtml(complaint.adminRemark || "None")}</p>
            ${renderAttachmentLinks(complaint)}
        </article>

        <article class="card">
            <h3>Status Timeline</h3>
            ${timeline}
        </article>

        <article class="card">
            <h3>Comments</h3>
            ${renderCommentList(complaint)}
            <form action="/complaint/${escapeHtml(String(complaint._id))}/comments" method="POST" data-enhanced-form>
                <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
                <label for="message">Add Comment</label>
                <textarea id="message" name="message" required data-inline-validate></textarea>
                <button type="submit" data-loading-text="Posting...">Post Comment</button>
            </form>
        </article>

        ${renderCommonFooter()}
    </main>`
    });
};

const renderSecurityPage = ({ csrfToken, security, flash = null, errors = [], error = null }) => renderLayout({
    title: "Security Settings",
    flash,
    body: `<main class="container fade-in">
        <header>
            <h1>Security Settings</h1>
            <nav>
                ${renderNavLink({ href: "/dashboard", label: "Dashboard" })}
                ${renderNavLink({ href: "/security", label: "Security", active: true })}
                ${renderNavLink({ href: "/logout", label: "Logout" })}
            </nav>
        </header>
        ${renderErrors({ error, errors })}
        <section class="card">
            <h3>Email Verification</h3>
            <p>Status: <strong>${security.emailVerified ? "Verified" : "Not Verified"}</strong></p>
            ${security.emailVerified ? "" : `<form action="/verify-email/resend" method="POST" data-enhanced-form>
                <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
                <button type="submit" data-loading-text="Sending...">Resend Verification Link</button>
            </form>`}
        </section>
        <section class="card">
            <h3>Two-Factor Authentication</h3>
            <p>${security.twoFactorEnabled ? "Enabled (email OTP)" : "Disabled"}.</p>
            <form action="/security/2fa/${security.twoFactorEnabled ? "disable" : "enable"}" method="POST" data-enhanced-form>
                <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
                <button type="submit" data-loading-text="Updating...">${security.twoFactorEnabled ? "Disable 2FA" : "Enable 2FA"}</button>
            </form>
        </section>
        ${renderCommonFooter()}
    </main>`
});

const renderPublicTrackingPage = ({ csrfToken, complaint = null, trackingId = "", error = null, flash = null }) => renderLayout({
    title: "Track Complaint",
    flash,
    body: `<main class="container fade-in">
        <header>
            <h1>Track Complaint</h1>
            <nav>
                ${renderNavLink({ href: "/", label: "Home" })}
                ${renderNavLink({ href: "/track", label: "Track Complaint", active: true })}
                ${renderNavLink({ href: "/login", label: "Login" })}
            </nav>
        </header>

        <section class="message">Enter your public tracking ID to view complaint status.</section>
        ${error ? `<section class="message error-message">${escapeHtml(error)}</section>` : ""}

        <form action="/track" method="POST" data-enhanced-form>
            <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
            <label for="trackingId">Tracking ID</label>
            <input id="trackingId" name="trackingId" value="${escapeHtml(trackingId)}" placeholder="CP-XXXXXXXX" required data-inline-validate>
            <button type="submit" data-loading-text="Checking...">Check Status</button>
        </form>

        ${complaint ? `<article class="card" style="margin-top:1rem;">
            <h3>Tracking Result</h3>
            <p><strong>Tracking ID:</strong> ${escapeHtml(complaint.publicTrackingId)}</p>
            <p><strong>Title:</strong> ${escapeHtml(complaint.title)}</p>
            <p><strong>Status:</strong> <span class="pill status-${statusToClass(complaint.status)}">${escapeHtml(complaint.status)}</span></p>
            <p><strong>Priority:</strong> ${escapeHtml(complaint.priority)}</p>
            <p><strong>Department:</strong> ${escapeHtml(complaint.assignedDepartment || "General")}</p>
            <p><strong>Filed On:</strong> ${escapeHtml(formatDateTime(complaint.date))}</p>
            <p><strong>Last Update:</strong> ${escapeHtml(formatDateTime(complaint.updatedAt))}</p>
            <p><strong>SLA Due:</strong> ${escapeHtml(formatDateTime(complaint.slaDueAt))}</p>
            <p><strong>Escalation Level:</strong> ${escapeHtml(complaint.escalationLevel || 0)}</p>
        </article>` : ""}

        ${renderCommonFooter()}
    </main>`
});

module.exports = {
    renderComplaintPage,
    renderDashboardPage,
    renderComplaintHistoryPage,
    renderSecurityPage,
    renderPublicTrackingPage
};
