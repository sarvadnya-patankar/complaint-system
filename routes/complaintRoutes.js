const fs = require("fs");
const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const csrf = require("csurf");
const { body, validationResult } = require("express-validator");
const Complaint = require("../models/Complaint");
const { ensureAuthenticated } = require("../middleware/authMiddleware");
const { STAFF_ROLES, normalizeRole } = require("../constants/roles");
const { DEPARTMENTS } = require("../constants/departments");
const { complaintAttachmentUpload } = require("../middleware/uploadMiddleware");
const { setFlash, consumeFlash } = require("../utils/flash");
const { getSlaDueAt } = require("../services/slaService");
const { buildListOptions, buildPagination } = require("../utils/listing");
const {
    renderComplaintPage,
    renderDashboardPage,
    renderComplaintHistoryPage,
    renderPublicTrackingPage
} = require("../views/templates");

const router = express.Router();
const complaintCsrfProtection = csrf();
const uploadBaseDir = path.join(__dirname, "..", "uploads", "complaints");

const isStaff = role => STAFF_ROLES.includes(normalizeRole(role));

const mapCategoryToDepartment = category => {
    if (!category) return "General";
    const normalized = String(category).toLowerCase();
    if (normalized.includes("water") || normalized.includes("electric") || normalized.includes("utility")) return "Utilities";
    if (normalized.includes("road") || normalized.includes("bridge") || normalized.includes("infrastructure")) return "Infrastructure";
    if (normalized.includes("garbage") || normalized.includes("sanitation")) return "Sanitation";
    if (normalized.includes("hospital") || normalized.includes("health")) return "Healthcare";
    if (normalized.includes("police") || normalized.includes("safety")) return "Public Safety";
    if (normalized.includes("transport") || normalized.includes("bus") || normalized.includes("traffic")) return "Transport";
    if (normalized.includes("school") || normalized.includes("education")) return "Education";
    return "General";
};

const canAccessComplaint = (complaint, req) => complaint.userId.toString() === req.session.userId || isStaff(req.session.role);

const renderComplaintForm = (req, res, options = {}) => {
    const { status = 200, errors = [], formData = {} } = options;
    const role = normalizeRole(req.session.role);

    return res.status(status).send(renderComplaintPage({
        csrfToken: req.csrfToken(),
        isStaff: isStaff(role),
        errors,
        formData,
        departments: DEPARTMENTS,
        flash: consumeFlash(req)
    }));
};

const buildDashboardFilter = req => {
    const { title = "", category = "", status = "" } = req.query;
    const filter = { userId: req.session.userId };

    if (title) filter.title = { $regex: title, $options: "i" };
    if (category) filter.category = { $regex: category, $options: "i" };
    if (status) filter.status = status;

    return {
        filter,
        filters: { title, category, status }
    };
};

const getUserChartData = async userId => {
    const userObjectId = new mongoose.Types.ObjectId(String(userId));
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const [statusStats, monthlyTrend] = await Promise.all([
        Complaint.aggregate([
            { $match: { userId: userObjectId } },
            { $group: { _id: "$status", count: { $sum: 1 } } }
        ]),
        Complaint.aggregate([
            {
                $match: {
                    userId: userObjectId,
                    date: { $gte: sixMonthsAgo }
                }
            },
            {
                $group: {
                    _id: { year: { $year: "$date" }, month: { $month: "$date" } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } }
        ])
    ]);

    return {
        statusStats,
        monthlyTrend: monthlyTrend.map(item => ({
            label: `${item._id.year}-${String(item._id.month).padStart(2, "0")}`,
            count: item.count
        }))
    };
};

router.get("/dashboard", ensureAuthenticated, async (req, res) => {
    const role = normalizeRole(req.session.role);
    if (isStaff(role)) {
        return res.redirect("/admin");
    }

    const { filter, filters } = buildDashboardFilter(req);
    const listOptions = buildListOptions(req.query);
    const [complaints, total, chartData] = await Promise.all([
        Complaint.find(filter)
            .sort(listOptions.sort)
            .skip(listOptions.skip)
            .limit(listOptions.limit),
        Complaint.countDocuments(filter),
        getUserChartData(req.session.userId)
    ]);

    const pagination = buildPagination({
        page: listOptions.page,
        limit: listOptions.limit,
        total,
        basePath: "/dashboard",
        query: {
            ...filters,
            sortBy: listOptions.sortBy,
            order: listOptions.order
        }
    });

    return res.send(renderDashboardPage({
        complaints,
        csrfToken: req.csrfToken(),
        isStaff: false,
        searchApplied: Boolean(filters.title || filters.category || filters.status),
        filters,
        listOptions,
        pagination,
        chartData,
        flash: consumeFlash(req)
    }));
});

router.post("/dashboard/search", ensureAuthenticated, async (req, res) => {
    if (isStaff(req.session.role)) {
        return res.redirect("/admin");
    }

    const params = new URLSearchParams();
    ["title", "category", "status", "sortBy", "order", "limit"].forEach(key => {
        if (req.body[key]) {
            params.set(key, req.body[key]);
        }
    });

    return res.redirect(`/dashboard?${params.toString()}`);
});

router.get("/complaint", ensureAuthenticated, (req, res) => {
    renderComplaintForm(req, res);
});

router.post(
    "/complaint",
    ensureAuthenticated,
    complaintAttachmentUpload.array("attachments", 5),
    complaintCsrfProtection,
    [
        body("title").trim().notEmpty().withMessage("Title is required"),
        body("description").trim().notEmpty().withMessage("Description is required"),
        body("category").trim().notEmpty().withMessage("Category is required"),
        body("priority").trim().isIn(["Low", "Medium", "High"]).withMessage("Invalid priority")
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return renderComplaintForm(req, res, {
                status: 400,
                errors: errors.array().map(item => item.msg),
                formData: {
                    title: req.body.title,
                    description: req.body.description,
                    category: req.body.category,
                    priority: req.body.priority,
                    assignedDepartment: req.body.assignedDepartment
                }
            });
        }

        const { title, description, category, priority } = req.body;
        const assignedDepartment = DEPARTMENTS.includes(req.body.assignedDepartment)
            ? req.body.assignedDepartment
            : mapCategoryToDepartment(category);

        try {
            const attachments = (req.files || []).map(file => ({
                originalName: file.originalname,
                fileName: file.filename,
                mimeType: file.mimetype,
                size: file.size
            }));

            const newComplaint = new Complaint({
                title,
                description,
                category,
                priority,
                userId: req.session.userId,
                assignedDepartment,
                slaDueAt: getSlaDueAt(priority),
                attachments
            });

            await newComplaint.save();
            setFlash(req, "success", `Complaint submitted. Tracking ID: ${newComplaint.publicTrackingId}`);
            return res.redirect("/dashboard");
        } catch (error) {
            return renderComplaintForm(req, res, {
                status: 500,
                errors: ["Unable to submit complaint right now"],
                formData: { title, description, category, priority, assignedDepartment }
            });
        }
    }
);

router.get("/complaint/:id/history", ensureAuthenticated, async (req, res) => {
    const complaint = await Complaint.findById(req.params.id).populate("assignedTo", "name role department");

    if (!complaint) {
        return res.status(404).send("Complaint not found");
    }
    if (!canAccessComplaint(complaint, req)) {
        return res.status(403).send("Forbidden");
    }

    return res.send(renderComplaintHistoryPage({
        complaint,
        csrfToken: req.csrfToken(),
        isStaff: isStaff(req.session.role),
        flash: consumeFlash(req)
    }));
});

router.post(
    "/complaint/:id/comments",
    ensureAuthenticated,
    [body("message").trim().notEmpty().withMessage("Comment cannot be empty")],
    async (req, res) => {
        const complaint = await Complaint.findById(req.params.id);
        if (!complaint) {
            return res.status(404).send("Complaint not found");
        }
        if (!canAccessComplaint(complaint, req)) {
            return res.status(403).send("Forbidden");
        }

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            setFlash(req, "error", errors.array()[0].msg);
            return res.redirect(`/complaint/${req.params.id}/history`);
        }

        complaint.comments.push({
            authorId: req.session.userId,
            authorName: req.session.username || "User",
            authorRole: normalizeRole(req.session.role),
            message: req.body.message.trim()
        });
        await complaint.save();

        setFlash(req, "success", "Comment added.");
        return res.redirect(`/complaint/${req.params.id}/history`);
    }
);

router.get("/complaint/:id/attachment/:fileName", ensureAuthenticated, async (req, res) => {
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
        return res.status(404).send("Complaint not found");
    }
    if (!canAccessComplaint(complaint, req)) {
        return res.status(403).send("Forbidden");
    }

    const fileName = path.basename(req.params.fileName);
    const attachment = (complaint.attachments || []).find(item => item.fileName === fileName);
    if (!attachment) {
        return res.status(404).send("Attachment not found");
    }

    const filePath = path.join(uploadBaseDir, fileName);
    if (!fs.existsSync(filePath)) {
        return res.status(404).send("File missing");
    }

    res.setHeader("Content-Type", attachment.mimeType || "application/octet-stream");
    return res.sendFile(filePath);
});

router.post("/complaint/:id/delete", ensureAuthenticated, async (req, res) => {
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
        return res.status(404).send("Complaint not found");
    }
    if (!canAccessComplaint(complaint, req)) {
        return res.status(403).send("Forbidden");
    }

    (complaint.attachments || []).forEach(file => {
        const filePath = path.join(uploadBaseDir, path.basename(file.fileName));
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    });

    await Complaint.findByIdAndDelete(req.params.id);
    setFlash(req, "success", "Complaint deleted successfully.");
    return res.redirect("/dashboard");
});

router.get("/track", (req, res) => {
    return res.send(renderPublicTrackingPage({
        csrfToken: req.csrfToken(),
        complaint: null,
        trackingId: "",
        flash: consumeFlash(req)
    }));
});

router.post(
    "/track",
    [body("trackingId").trim().notEmpty().withMessage("Tracking ID is required")],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).send(renderPublicTrackingPage({
                csrfToken: req.csrfToken(),
                complaint: null,
                trackingId: req.body.trackingId || "",
                error: errors.array()[0].msg,
                flash: consumeFlash(req)
            }));
        }

        const trackingId = req.body.trackingId.trim().toUpperCase();
        const complaint = await Complaint.findOne({ publicTrackingId: trackingId });

        if (!complaint) {
            return res.status(404).send(renderPublicTrackingPage({
                csrfToken: req.csrfToken(),
                complaint: null,
                trackingId,
                error: "No complaint found for this tracking ID",
                flash: consumeFlash(req)
            }));
        }

        return res.send(renderPublicTrackingPage({
            csrfToken: req.csrfToken(),
            complaint: {
                publicTrackingId: complaint.publicTrackingId,
                title: complaint.title,
                category: complaint.category,
                status: complaint.status,
                priority: complaint.priority,
                assignedDepartment: complaint.assignedDepartment,
                date: complaint.date,
                slaDueAt: complaint.slaDueAt,
                escalationLevel: complaint.escalationLevel,
                updatedAt: complaint.updatedAt
            },
            trackingId,
            flash: consumeFlash(req)
        }));
    }
);

module.exports = router;
