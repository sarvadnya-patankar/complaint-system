const Complaint = require("../models/Complaint");
const User = require("../models/User");
const logger = require("./logger");
const { notifyComplaintOwner, notifyUserByPreferences } = require("./notificationService");
const { ROLES } = require("../constants/roles");

const SLA_HOURS = {
    High: Number(process.env.SLA_HOURS_HIGH || 24),
    Medium: Number(process.env.SLA_HOURS_MEDIUM || 72),
    Low: Number(process.env.SLA_HOURS_LOW || 120)
};

const SLA_CHECK_INTERVAL_MS = Number(process.env.SLA_CHECK_INTERVAL_MS) || 5 * 60 * 1000;
const SLA_REMINDER_WINDOW_HOURS = Number(process.env.SLA_REMINDER_WINDOW_HOURS || 6);

let intervalRef;

const getSlaDueAt = priority => {
    const hours = SLA_HOURS[priority] || SLA_HOURS.Medium;
    return new Date(Date.now() + hours * 60 * 60 * 1000);
};

const notifyAssignedStaff = async (complaint, subject, message) => {
    const staffTargets = [];

    if (complaint.assignedTo) {
        const assigned = await User.findById(complaint.assignedTo);
        if (assigned) {
            staffTargets.push(assigned);
        }
    } else if (complaint.assignedDepartment) {
        const departmentStaff = await User.find({
            department: complaint.assignedDepartment,
            role: { $in: [ROLES.AGENT, ROLES.DEPARTMENT_ADMIN, ROLES.SUPER_ADMIN, "admin"] }
        });
        staffTargets.push(...departmentStaff);
    }

    const results = [];
    for (const user of staffTargets) {
        const sent = await notifyUserByPreferences({ user, subject, message });
        results.push(...sent);
    }
    return results;
};

const runSlaCycle = async () => {
    const now = new Date();
    const unresolved = await Complaint.find({
        status: { $ne: "Resolved" },
        slaDueAt: { $ne: null }
    });

    for (const complaint of unresolved) {
        const dueAt = new Date(complaint.slaDueAt);
        const hoursToDue = (dueAt.getTime() - now.getTime()) / (1000 * 60 * 60);
        const hoursOverdue = (now.getTime() - dueAt.getTime()) / (1000 * 60 * 60);

        if (hoursToDue <= SLA_REMINDER_WINDOW_HOURS && hoursToDue > 0 && !complaint.reminderSentAt) {
            const message = `Reminder: Complaint "${complaint.title}" is due by ${dueAt.toLocaleString()}.`;
            const ownerNotifications = await notifyComplaintOwner({
                complaint,
                subject: "Complaint SLA Reminder",
                message
            });
            const staffNotifications = await notifyAssignedStaff(complaint, "Complaint SLA Reminder", message);
            complaint.notificationsSent.push(...ownerNotifications, ...staffNotifications);
            complaint.reminderSentAt = now;
            await complaint.save();
            logger.info("sla.reminder_sent", { complaintId: String(complaint._id), publicTrackingId: complaint.publicTrackingId });
        }

        if (hoursOverdue > 0 && complaint.escalationLevel === 0) {
            const message = `Escalation Level 1: Complaint "${complaint.title}" is overdue since ${dueAt.toLocaleString()}.`;
            const ownerNotifications = await notifyComplaintOwner({
                complaint,
                subject: "Complaint Escalated (Level 1)",
                message
            });
            const staffNotifications = await notifyAssignedStaff(complaint, "Complaint Escalated (Level 1)", message);
            complaint.notificationsSent.push(...ownerNotifications, ...staffNotifications);
            complaint.escalationLevel = 1;
            complaint.escalatedAt = now;
            complaint.statusLogs.push({
                status: complaint.status,
                remark: "Auto escalation triggered (Level 1) by SLA engine.",
                updatedBy: "sla_engine",
                updatedAt: now
            });
            await complaint.save();
            logger.warn("sla.escalation_l1", { complaintId: String(complaint._id), publicTrackingId: complaint.publicTrackingId });
        } else if (hoursOverdue >= 24 && complaint.escalationLevel === 1) {
            const message = `Escalation Level 2: Complaint "${complaint.title}" is overdue for more than 24 hours.`;
            const ownerNotifications = await notifyComplaintOwner({
                complaint,
                subject: "Complaint Escalated (Level 2)",
                message
            });
            const staffNotifications = await notifyAssignedStaff(complaint, "Complaint Escalated (Level 2)", message);
            complaint.notificationsSent.push(...ownerNotifications, ...staffNotifications);
            complaint.escalationLevel = 2;
            complaint.escalatedAt = now;
            complaint.statusLogs.push({
                status: complaint.status,
                remark: "Auto escalation triggered (Level 2) by SLA engine.",
                updatedBy: "sla_engine",
                updatedAt: now
            });
            await complaint.save();
            logger.warn("sla.escalation_l2", { complaintId: String(complaint._id), publicTrackingId: complaint.publicTrackingId });
        }
    }
};

const startSlaScheduler = () => {
    if (process.env.NODE_ENV === "test" || intervalRef) {
        return;
    }

    intervalRef = setInterval(() => {
        runSlaCycle().catch(err => logger.error("sla.cycle_error", err));
    }, SLA_CHECK_INTERVAL_MS);

    intervalRef.unref();
};

module.exports = {
    getSlaDueAt,
    runSlaCycle,
    startSlaScheduler
};
