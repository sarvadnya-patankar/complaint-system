const mongoose = require("mongoose");
const crypto = require("crypto");
const { DEPARTMENTS } = require("../constants/departments");

const complaintSchema = new mongoose.Schema({

    title: {
        type: String,
        required: true
    },

    description: {
        type: String,
        required: true
    },

    category: {
        type: String,
        required: true
    },

    priority: {
        type: String,
        required: true
    },

    status: {
        type: String,
        default: "Pending"
    },

    resolvedAt: {
        type: Date,
        default: null
    },

    adminRemark: {
        type: String,
        default: ""
    },

    statusLogs: [
        {
            status: {
                type: String,
                required: true
            },
            remark: {
                type: String,
                default: ""
            },
            updatedBy: {
                type: String,
                default: "system"
            },
            updatedAt: {
                type: Date,
                default: Date.now
            }
        }
    ],

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },

    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    },

    assignedDepartment: {
        type: String,
        enum: DEPARTMENTS,
        default: "General"
    },

    publicTrackingId: {
        type: String,
        unique: true,
        index: true
    },

    attachments: [
        {
            originalName: String,
            fileName: String,
            mimeType: String,
            size: Number,
            uploadedAt: {
                type: Date,
                default: Date.now
            }
        }
    ],

    comments: [
        {
            authorId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User"
            },
            authorName: String,
            authorRole: String,
            message: String,
            createdAt: {
                type: Date,
                default: Date.now
            }
        }
    ],

    slaDueAt: {
        type: Date,
        default: null
    },

    escalationLevel: {
        type: Number,
        default: 0
    },

    reminderSentAt: {
        type: Date,
        default: null
    },

    escalatedAt: {
        type: Date,
        default: null
    },

    date: {
        type: Date,
        default: Date.now
    },

    deadline: {
        type: Date,
        default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    },

    isNotified: {
        type: Boolean,
        default: false
    },

    notificationsSent: [
        {
            type: String,
            message: String,
            sentAt: {
                type: Date,
                default: Date.now
            }
        }
    ]

});

complaintSchema.pre("validate", function() {
    if (!this.publicTrackingId) {
        this.publicTrackingId = `CP-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    }
});

complaintSchema.index({ userId: 1, date: -1 });
complaintSchema.index({ status: 1 });
complaintSchema.index({ category: 1 });
complaintSchema.index({ date: -1 });
complaintSchema.index({ status: 1, priority: 1, date: -1 });
complaintSchema.index({ assignedDepartment: 1, status: 1, date: -1 });
complaintSchema.index({ assignedTo: 1, status: 1, date: -1 });
complaintSchema.index({ slaDueAt: 1, status: 1, escalationLevel: 1 });
complaintSchema.index({ "comments.createdAt": -1 });

module.exports = mongoose.model("Complaint", complaintSchema);
