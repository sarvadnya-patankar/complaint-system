const { escapeHtml, formatDateTime, statusToClass } = require("../helpers");
const { renderLayout, renderNavLink, renderCommonFooter } = require("../layout");
const { ROLES } = require("../../../constants/roles");

const toJsonAttr = value => escapeHtml(JSON.stringify(value || []));

const renderPagination = pagination => {
    if (!pagination || pagination.totalPages <= 1) return "";
    return `<div class="pagination">
        <span>Page ${pagination.page} of ${pagination.totalPages} (${pagination.total} total)</span>
        <div class="actions">
            ${pagination.hasPrev ? `<a class="button" href="${escapeHtml(pagination.prevLink)}">Prev</a>` : ""}
            ${pagination.hasNext ? `<a class="button" href="${escapeHtml(pagination.nextLink)}">Next</a>` : ""}
        </div>
    </div>`;
};

const renderAssignmentForm = (complaint, csrfToken, staffUsers, departments, role) => {
    const canAssignDepartment = role === ROLES.SUPER_ADMIN || role === "admin";
    return `<form action="/admin/assign/${escapeHtml(String(complaint._id))}" method="POST" class="form-inline" data-enhanced-form>
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
        <label for="assignedDepartment-${escapeHtml(String(complaint._id))}">Department:</label>
        <select id="assignedDepartment-${escapeHtml(String(complaint._id))}" name="assignedDepartment" ${canAssignDepartment ? "" : "disabled"}>
            ${departments.map(dep => `<option value="${escapeHtml(dep)}"${dep === complaint.assignedDepartment ? " selected" : ""}>${escapeHtml(dep)}</option>`).join("")}
        </select>
        <label for="assignedTo-${escapeHtml(String(complaint._id))}">Assign To:</label>
        <select id="assignedTo-${escapeHtml(String(complaint._id))}" name="assignedTo">
            <option value="">Unassigned</option>
            ${staffUsers.map(user => `<option value="${escapeHtml(String(user._id))}"${complaint.assignedTo && String(complaint.assignedTo._id) === String(user._id) ? " selected" : ""}>${escapeHtml(user.name)} (${escapeHtml(user.role)})</option>`).join("")}
        </select>
        <button type="submit" class="button" data-loading-text="Assigning...">Assign</button>
    </form>`;
};

const renderAttachmentList = complaint => {
    if (!complaint.attachments || complaint.attachments.length === 0) return "";
    return `<div style="margin-top:0.6rem;">
        <strong>Attachments:</strong>
        <ul>
            ${complaint.attachments.map(file => `<li><a href="/complaint/${escapeHtml(String(complaint._id))}/attachment/${escapeHtml(file.fileName)}">${escapeHtml(file.originalName)}</a></li>`).join("")}
        </ul>
    </div>`;
};

const renderAdminCards = ({ complaints, csrfToken, staffUsers = [], departments = [], role }) => {
    if (!complaints || complaints.length === 0) {
        return '<section class="empty-state"><h4>No complaints found</h4><p>Try another filter range or category.</p></section>';
    }

    return complaints.map(complaint => {
        const dueAt = complaint.slaDueAt ? new Date(complaint.slaDueAt) : null;
        const now = new Date();
        const overdue = dueAt && dueAt < now && complaint.status !== "Resolved";
        const id = escapeHtml(String(complaint._id));

        return `<article class="card">
                <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:0.5rem;gap:0.5rem;flex-wrap:wrap;">
                    <strong>${escapeHtml(complaint.title)}</strong>
                    <span class="pill status-${statusToClass(complaint.status)}">${escapeHtml(complaint.status)}</span>
                </div>
                <p class="card-meta">
                    <span class="pill">Tracking: ${escapeHtml(complaint.publicTrackingId || "N/A")}</span>
                    <span class="pill">Category: ${escapeHtml(complaint.category)}</span>
                    <span class="pill">Department: ${escapeHtml(complaint.assignedDepartment || "General")}</span>
                    <span class="pill">Priority: ${escapeHtml(complaint.priority)}</span>
                    ${dueAt ? `<span class="pill ${overdue ? "danger" : "warning"}">SLA Due: ${escapeHtml(formatDateTime(dueAt))}</span>` : ""}
                    <span class="pill ${complaint.escalationLevel > 0 ? "danger" : ""}">Escalation: ${escapeHtml(complaint.escalationLevel || 0)}</span>
                </p>
                <p>${escapeHtml(complaint.description)}</p>
                <p><strong>Assigned Staff:</strong> ${escapeHtml(complaint.assignedTo?.name || "Unassigned")}</p>
                ${renderAttachmentList(complaint)}
                <div class="actions">
                    <a class="button" href="/complaint/${id}/history">History & Comments</a>
                    <form action="/admin/notify/${id}" method="POST" data-enhanced-form>
                        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
                        <button type="submit" class="button" data-loading-text="Sending...">Send Notification</button>
                    </form>
                </div>

                ${renderAssignmentForm(complaint, csrfToken, staffUsers, departments, role)}

                <form action="/update/${id}" method="POST" class="form-inline" data-enhanced-form>
                    <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
                    <label for="status-${id}">Status:</label>
                    <select id="status-${id}" name="status" required>
                        <option${complaint.status === "Pending" ? " selected" : ""}>Pending</option>
                        <option${complaint.status === "In Progress" ? " selected" : ""}>In Progress</option>
                        <option${complaint.status === "Resolved" ? " selected" : ""}>Resolved</option>
                    </select>
                    <label for="remark-${id}">Remark:</label>
                    <input id="remark-${id}" type="text" name="remark" placeholder="Add remark..." value="${escapeHtml(complaint.adminRemark || "")}">
                    <button type="submit" class="button" data-loading-text="Updating...">Update</button>
                </form>
            </article>`;
    }).join("");
};

const renderAdminPage = ({
    complaints,
    csrfToken,
    searchApplied = false,
    filters = {},
    listOptions = {},
    pagination = null,
    staffUsers = [],
    departments = [],
    flash = null,
    canExport = true,
    role = ROLES.AGENT
}) => renderLayout({
    title: "Admin Panel",
    flash,
    extraHead: `<style>
        .search-filters { background:#f8faff;border:1px solid #dde8f8;border-radius:12px;padding:1.5rem;margin-bottom:1.5rem; }
        .search-filters h3 { margin-top:0;color:#162a6b;margin-bottom:1rem; }
        .filter-grid { display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;margin-bottom:1rem; }
        .filter-grid input,.filter-grid select { width:100%; }
        .form-inline { display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;margin-top:1rem; }
        .form-inline label { margin-right:0.3rem;font-weight:600; }
        .form-inline select,.form-inline input { padding:0.5rem 0.7rem;font-size:0.85rem;border-radius:6px;border:1px solid #cbd7ee; }
        .pagination { margin-top:1rem;display:flex;justify-content:space-between;align-items:center;gap:0.8rem;flex-wrap:wrap; }
    </style>`,
    body: `<main class="container fade-in">
        <header>
            <h1>Admin Panel</h1>
            <nav>
                ${renderNavLink({ href: "/admin", label: "Manage", active: true })}
                ${renderNavLink({ href: "/admin/analytics", label: "Analytics" })}
                ${canExport ? renderNavLink({ href: "/admin/export/pdf", label: "PDF", className: "button" }) : ""}
                ${canExport ? renderNavLink({ href: "/admin/export/csv", label: "CSV", className: "button" }) : ""}
                ${renderNavLink({ href: "/security", label: "Security" })}
                ${renderNavLink({ href: "/logout", label: "Logout" })}
            </nav>
        </header>

        <section class="message">
            Manage assignments, status updates, SLA escalations, and notifications.
        </section>

        <div class="search-filters">
            <h3>Search, Sort & Filter</h3>
            <form action="/admin/search" method="POST" data-enhanced-form>
                <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
                <div class="filter-grid">
                    <input type="text" name="title" placeholder="Search by title..." value="${escapeHtml(filters.title || "")}">
                    <input type="text" name="category" placeholder="Category..." value="${escapeHtml(filters.category || "")}">
                    <select name="status">
                        <option value="">-- All Status --</option>
                        <option${filters.status === "Pending" ? " selected" : ""}>Pending</option>
                        <option${filters.status === "In Progress" ? " selected" : ""}>In Progress</option>
                        <option${filters.status === "Resolved" ? " selected" : ""}>Resolved</option>
                    </select>
                    <select name="assignedDepartment">
                        <option value="">-- All Departments --</option>
                        ${departments.map(dep => `<option value="${escapeHtml(dep)}"${filters.assignedDepartment === dep ? " selected" : ""}>${escapeHtml(dep)}</option>`).join("")}
                    </select>
                    <select name="assignedTo">
                        <option value="">-- Any Staff --</option>
                        ${staffUsers.map(user => `<option value="${escapeHtml(String(user._id))}"${filters.assignedTo === String(user._id) ? " selected" : ""}>${escapeHtml(user.name)}</option>`).join("")}
                    </select>
                    <input type="date" name="dateFrom" value="${escapeHtml(filters.dateFrom || "")}">
                    <input type="date" name="dateTo" value="${escapeHtml(filters.dateTo || "")}">
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
                    ${searchApplied ? '<a href="/admin" class="button" style="background:#e8efff;color:#3366ff;border:1px solid #d0dbf9;">Clear</a>' : ""}
                </div>
            </form>
        </div>

        ${renderAdminCards({ complaints, csrfToken, staffUsers, departments, role })}
        ${renderPagination(pagination)}
        ${renderCommonFooter()}
    </main>`
});

const renderAnalyticsPage = ({
    totalComplaints,
    statusStats,
    categoryStats,
    priorityStats,
    overdueComplaints,
    trendStats = [],
    departmentPerformance = [],
    flash = null,
    canExport = true
}) => renderLayout({
    title: "Analytics Dashboard",
    flash,
    extraHead: `<style>
        .analytics-grid { display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem;margin-bottom:1rem; }
        .stat-card { background:linear-gradient(135deg,#6f88ff,#4d7eff);color:white;padding:1.2rem;border-radius:12px;box-shadow:0 8px 16px rgba(51,102,255,0.3);text-align:center; }
        .stat-card h3 { margin:0;font-size:2rem; }
        .stat-card.danger { background:linear-gradient(135deg,#d2475b,#bf3c49); }
        .chart-grid { display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1rem;margin-bottom:1rem; }
        .chart-container { background:white;border-radius:12px;padding:1rem;border:1px solid #dbe4f3;box-shadow:0 4px 12px rgba(20,30,80,0.08); }
        .perf-table { width:100%;border-collapse:collapse;font-size:0.9rem; }
        .perf-table th,.perf-table td { border-bottom:1px solid #e5edf9;padding:0.5rem;text-align:left; }
    </style>
    <script src="/js/charts.js" defer></script>`,
    body: `<main class="container fade-in">
        <header>
            <h1>Analytics Dashboard</h1>
            <nav>
                ${renderNavLink({ href: "/admin", label: "Manage" })}
                ${renderNavLink({ href: "/admin/analytics", label: "Analytics", active: true })}
                ${canExport ? renderNavLink({ href: "/admin/export/pdf", label: "PDF", className: "button" }) : ""}
                ${canExport ? renderNavLink({ href: "/admin/export/csv", label: "CSV", className: "button" }) : ""}
                ${renderNavLink({ href: "/logout", label: "Logout" })}
            </nav>
        </header>

        <section class="message">
            Trend, SLA, and department performance insights.
        </section>

        <div class="analytics-grid">
            <div class="stat-card">
                <h3>${escapeHtml(totalComplaints)}</h3>
                <p>Total Complaints</p>
            </div>
            <div class="stat-card danger">
                <h3>${escapeHtml(overdueComplaints)}</h3>
                <p>Overdue Complaints</p>
            </div>
        </div>

        <div class="chart-grid">
            <article class="chart-container">
                <h3>Status Breakdown</h3>
                <canvas class="chart-canvas" data-chart-type="bar" data-chart-label="Status" data-chart-data="${toJsonAttr(statusStats)}"></canvas>
            </article>
            <article class="chart-container">
                <h3>Category Breakdown</h3>
                <canvas class="chart-canvas" data-chart-type="bar" data-chart-label="Category" data-chart-data="${toJsonAttr(categoryStats)}"></canvas>
            </article>
            <article class="chart-container">
                <h3>Priority Breakdown</h3>
                <canvas class="chart-canvas" data-chart-type="bar" data-chart-label="Priority" data-chart-data="${toJsonAttr(priorityStats)}"></canvas>
            </article>
            <article class="chart-container">
                <h3>Monthly Trend</h3>
                <canvas class="chart-canvas" data-chart-type="line" data-chart-label="Trend" data-chart-data="${toJsonAttr(trendStats)}"></canvas>
            </article>
        </div>

        <article class="chart-container">
            <h3>Department Performance</h3>
            <table class="perf-table">
                <thead>
                    <tr>
                        <th>Department</th>
                        <th>Total</th>
                        <th>Resolved</th>
                        <th>Resolution Rate</th>
                        <th>Avg Resolution (hrs)</th>
                    </tr>
                </thead>
                <tbody>
                    ${departmentPerformance.length === 0 ? `<tr><td colspan="5">No data available</td></tr>` : departmentPerformance.map(item => `<tr>
                        <td>${escapeHtml(item.department)}</td>
                        <td>${escapeHtml(item.total)}</td>
                        <td>${escapeHtml(item.resolved)}</td>
                        <td>${escapeHtml(item.resolutionRate)}%</td>
                        <td>${item.avgResolutionHours === null ? "N/A" : escapeHtml(item.avgResolutionHours)}</td>
                    </tr>`).join("")}
                </tbody>
            </table>
        </article>

        ${canExport ? `<article class="chart-container">
            <h3>Export Reports</h3>
            <div class="actions">
                <a href="/admin/export/pdf" class="button">Export as PDF</a>
                <a href="/admin/export/csv" class="button">Export as CSV</a>
            </div>
        </article>` : ""}

        ${renderCommonFooter()}
    </main>`
});

module.exports = {
    renderAdminPage,
    renderAnalyticsPage
};
