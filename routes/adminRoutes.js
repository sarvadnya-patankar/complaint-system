const express = require("express");
const mongoose = require("mongoose");
const PDFDocument = require("pdfkit");
const csv = require("fast-csv");
const Complaint = require("../models/Complaint");
const User = require("../models/User");
const { ensureAdmin, ensureStaff } = require("../middleware/authMiddleware");
const { renderAdminPage, renderAnalyticsPage } = require("../views/templates");
const { setFlash, consumeFlash } = require("../utils/flash");
const { ADMIN_ROLES, ROLES, normalizeRole } = require("../constants/roles");
const { DEPARTMENTS } = require("../constants/departments");
const { buildListOptions, buildPagination } = require("../utils/listing");
const logger = require("../services/logger");
const { notifyComplaintOwner } = require("../services/notificationService");

const router = express.Router();

const canExportForRole = role => ADMIN_ROLES.includes(normalizeRole(role));

const getScopeFilter = req => {
    const role = normalizeRole(req.session.role);
    const department = req.session.department || "General";

    if (role === ROLES.SUPER_ADMIN || role === "admin") {
        return {};
    }
    if (role === ROLES.DEPARTMENT_ADMIN) {
        return { assignedDepartment: department };
    }
    if (role === ROLES.AGENT) {
        return {
            $or: [
                { assignedTo: new mongoose.Types.ObjectId(req.session.userId) },
                { assignedDepartment: department }
            ]
        };
    }
    return { _id: null };
};

const buildAdminFilter = req => {
    const scopeFilter = getScopeFilter(req);
    const {
        title = "",
        category = "",
        status = "",
        dateFrom = "",
        dateTo = "",
        assignedDepartment = "",
        assignedTo = ""
    } = req.query;

    const filter = { ...scopeFilter };
    if (title) filter.title = { $regex: title, $options: "i" };
    if (category) filter.category = { $regex: category, $options: "i" };
    if (status) filter.status = status;
    if (assignedDepartment) filter.assignedDepartment = assignedDepartment;
    if (assignedTo) filter.assignedTo = assignedTo;

    if (dateFrom || dateTo) {
        filter.date = {};
        if (dateFrom) filter.date.$gte = new Date(dateFrom);
        if (dateTo) filter.date.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
    }

    return {
        filter,
        filters: { title, category, status, dateFrom, dateTo, assignedDepartment, assignedTo }
    };
};

const getStaffListForScope = async req => {
    const role = normalizeRole(req.session.role);
    if (role === ROLES.SUPER_ADMIN || role === "admin") {
        return User.find({
            role: { $in: [ROLES.AGENT, ROLES.DEPARTMENT_ADMIN, ROLES.SUPER_ADMIN, "admin"] }
        }).select("name email role department");
    }

    return User.find({
        role: { $in: [ROLES.AGENT, ROLES.DEPARTMENT_ADMIN] },
        department: req.session.department || "General"
    }).select("name email role department");
};

const getAnalyticsPayload = async req => {
    const scopeFilter = getScopeFilter(req);
    const resolvedMatch = {
        ...scopeFilter,
        status: "Resolved",
        resolvedAt: { $type: "date" }
    };

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const [
        totalComplaints,
        statusStats,
        categoryStats,
        priorityStats,
        overdueComplaints,
        avgResolutionTime,
        trendStats,
        departmentPerformance
    ] = await Promise.all([
        Complaint.countDocuments(scopeFilter),
        Complaint.aggregate([{ $match: scopeFilter }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
        Complaint.aggregate([{ $match: scopeFilter }, { $group: { _id: "$category", count: { $sum: 1 } } }]),
        Complaint.aggregate([{ $match: scopeFilter }, { $group: { _id: "$priority", count: { $sum: 1 } } }]),
        Complaint.countDocuments({
            ...scopeFilter,
            slaDueAt: { $lt: new Date() },
            status: { $ne: "Resolved" }
        }),
        Complaint.aggregate([
            { $match: resolvedMatch },
            { $group: { _id: null, avgTime: { $avg: { $subtract: ["$resolvedAt", "$date"] } } } }
        ]),
        Complaint.aggregate([
            { $match: { ...scopeFilter, date: { $gte: sixMonthsAgo } } },
            {
                $group: {
                    _id: { year: { $year: "$date" }, month: { $month: "$date" } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } }
        ]),
        Complaint.aggregate([
            { $match: scopeFilter },
            {
                $group: {
                    _id: "$assignedDepartment",
                    total: { $sum: 1 },
                    resolved: {
                        $sum: {
                            $cond: [{ $eq: ["$status", "Resolved"] }, 1, 0]
                        }
                    },
                    avgResolutionMs: {
                        $avg: {
                            $cond: [
                                { $and: [{ $eq: ["$status", "Resolved"] }, { $ifNull: ["$resolvedAt", false] }] },
                                { $subtract: ["$resolvedAt", "$date"] },
                                null
                            ]
                        }
                    }
                }
            }
        ])
    ]);

    return {
        totalComplaints,
        statusStats,
        categoryStats,
        priorityStats,
        overdueComplaints,
        avgResolutionTime: avgResolutionTime[0]?.avgTime || 0,
        trendStats: trendStats.map(item => ({
            label: `${item._id.year}-${String(item._id.month).padStart(2, "0")}`,
            count: item.count
        })),
        departmentPerformance: departmentPerformance.map(item => ({
            department: item._id || "Unassigned",
            total: item.total,
            resolved: item.resolved,
            resolutionRate: item.total ? Math.round((item.resolved / item.total) * 100) : 0,
            avgResolutionHours: item.avgResolutionMs ? Math.round((item.avgResolutionMs / (1000 * 60 * 60)) * 100) / 100 : null
        }))
    };
};

router.get("/admin", ensureStaff, async (req, res) => {
    const { filter, filters } = buildAdminFilter(req);
    const listOptions = buildListOptions(req.query);
    const [complaints, total, staffUsers] = await Promise.all([
        Complaint.find(filter)
            .populate("assignedTo", "name email role department")
            .sort(listOptions.sort)
            .skip(listOptions.skip)
            .limit(listOptions.limit),
        Complaint.countDocuments(filter),
        getStaffListForScope(req)
    ]);

    const pagination = buildPagination({
        page: listOptions.page,
        limit: listOptions.limit,
        total,
        basePath: "/admin",
        query: {
            ...filters,
            sortBy: listOptions.sortBy,
            order: listOptions.order
        }
    });

    res.send(renderAdminPage({
        complaints,
        csrfToken: req.csrfToken(),
        searchApplied: Boolean(
            filters.title
            || filters.category
            || filters.status
            || filters.dateFrom
            || filters.dateTo
            || filters.assignedDepartment
            || filters.assignedTo
        ),
        filters,
        listOptions,
        pagination,
        staffUsers,
        departments: DEPARTMENTS,
        flash: consumeFlash(req),
        canExport: canExportForRole(req.session.role),
        role: normalizeRole(req.session.role)
    }));
});

router.get("/admin/analytics", ensureAdmin, async (req, res) => {
    try {
        const analytics = await getAnalyticsPayload(req);
        res.send(renderAnalyticsPage({
            ...analytics,
            csrfToken: req.csrfToken(),
            flash: consumeFlash(req),
            canExport: canExportForRole(req.session.role)
        }));
    } catch (err) {
        res.status(500).send("Error loading analytics: " + err.message);
    }
});

router.post("/admin/search", ensureStaff, async (req, res) => {
    const params = new URLSearchParams();
    ["title", "category", "status", "dateFrom", "dateTo", "assignedDepartment", "assignedTo", "sortBy", "order", "limit"]
        .forEach(key => {
            if (req.body[key]) params.set(key, req.body[key]);
        });
    return res.redirect(`/admin?${params.toString()}`);
});

router.post("/admin/assign/:id", ensureStaff, async (req, res) => {
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
        return res.status(404).send("Complaint not found");
    }

    const role = normalizeRole(req.session.role);
    const requestedDepartment = DEPARTMENTS.includes(req.body.assignedDepartment)
        ? req.body.assignedDepartment
        : complaint.assignedDepartment;

    if (role === ROLES.DEPARTMENT_ADMIN && requestedDepartment !== (req.session.department || "General")) {
        return res.status(403).send("Forbidden: cannot assign outside your department");
    }

    complaint.assignedDepartment = requestedDepartment;
    complaint.assignedTo = req.body.assignedTo || null;
    complaint.statusLogs.push({
        status: complaint.status,
        remark: `Assignment updated. Department: ${requestedDepartment}`,
        updatedBy: role,
        updatedAt: new Date()
    });
    await complaint.save();

    setFlash(req, "success", "Assignment updated.");
    return res.redirect("/admin");
});

router.get("/admin/export/pdf", ensureAdmin, async (req, res) => {
    try {
        const scopeFilter = getScopeFilter(req);
        const complaints = await Complaint.find(scopeFilter).sort({ date: -1 });
        const doc = new PDFDocument();

        res.setHeader("Content-disposition", "attachment; filename=complaints.pdf");
        res.setHeader("Content-type", "application/pdf");
        doc.pipe(res);

        doc.fontSize(20).font("Helvetica-Bold").text("Complaint Portal Report", { align: "center" });
        doc.moveDown();
        doc.fontSize(10).font("Helvetica").text(`Generated on: ${new Date().toLocaleString()}`);
        doc.moveDown(0.5);

        complaints.forEach((complaint, index) => {
            doc.fontSize(12).font("Helvetica-Bold").text(`#${index + 1}: ${complaint.title}`);
            doc.fontSize(10).font("Helvetica");
            doc.text(`Tracking ID: ${complaint.publicTrackingId}`);
            doc.text(`Department: ${complaint.assignedDepartment} | Priority: ${complaint.priority} | Status: ${complaint.status}`);
            doc.text(`Description: ${complaint.description}`);
            doc.text(`Filed: ${new Date(complaint.date).toLocaleString()}`);
            if (complaint.adminRemark) doc.text(`Admin Remark: ${complaint.adminRemark}`);
            doc.moveDown(0.5);
        });

        doc.end();
    } catch (err) {
        res.status(500).send("PDF Export Error: " + err.message);
    }
});

router.get("/admin/export/csv", ensureAdmin, async (req, res) => {
    try {
        const scopeFilter = getScopeFilter(req);
        const complaints = await Complaint.find(scopeFilter).sort({ date: -1 });

        res.setHeader("Content-disposition", "attachment; filename=complaints.csv");
        res.setHeader("Content-type", "text/csv");

        const csvStream = csv.format({ headers: true });
        csvStream.pipe(res);

        complaints.forEach(c => {
            csvStream.write({
                trackingId: c.publicTrackingId,
                title: c.title,
                category: c.category,
                department: c.assignedDepartment,
                priority: c.priority,
                status: c.status,
                description: c.description,
                date: new Date(c.date).toLocaleDateString(),
                slaDueAt: c.slaDueAt ? new Date(c.slaDueAt).toLocaleDateString() : "N/A",
                adminRemark: c.adminRemark || "N/A"
            });
        });
        csvStream.end();
    } catch (err) {
        res.status(500).send("CSV Export Error: " + err.message);
    }
});

router.post("/admin/notify/:id", ensureStaff, async (req, res) => {
    try {
        const complaint = await Complaint.findById(req.params.id);
        if (!complaint) {
            return res.status(404).send("Complaint not found");
        }

        const message = `Update on complaint "${complaint.title}": status is ${complaint.status}. Remark: ${complaint.adminRemark || "None"}`;
        const sentNotifications = await notifyComplaintOwner({
            complaint,
            subject: "Complaint Status Update",
            message
        });

        complaint.notificationsSent.push(...sentNotifications);
        complaint.isNotified = sentNotifications.length > 0;
        await complaint.save();

        setFlash(req, "success", `Notification dispatch attempted via ${sentNotifications.length} channel(s).`);
        return res.redirect("/admin");
    } catch (err) {
        res.status(500).send("Notification Error: " + err.message);
    }
});

router.post("/update/:id", ensureStaff, async (req, res) => {
    const { status, remark } = req.body;
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
        return res.status(404).send("Complaint not found");
    }

    complaint.status = status;
    complaint.adminRemark = remark;
    complaint.resolvedAt = status === "Resolved" ? new Date() : null;
    complaint.statusLogs.push({
        status,
        remark,
        updatedBy: normalizeRole(req.session.role),
        updatedAt: new Date()
    });

    const message = `Your complaint "${complaint.title}" is now "${status}". Remark: ${remark || "None"}`;
    const sentNotifications = await notifyComplaintOwner({
        complaint,
        subject: "Complaint Status Updated",
        message
    });
    complaint.notificationsSent.push(...sentNotifications);
    complaint.isNotified = sentNotifications.length > 0;
    await complaint.save();

    logger.info("complaint.status_updated", {
        complaintId: String(complaint._id),
        status,
        updatedBy: normalizeRole(req.session.role),
        channels: sentNotifications.length
    });
    setFlash(req, "success", "Complaint updated and notifications sent.");
    return res.redirect("/admin");
});

module.exports = router;
