const mongoose = require("mongoose");
const { ROLES } = require("../constants/roles");
const { DEPARTMENTS } = require("../constants/departments");

const userSchema = new mongoose.Schema({

    name: {
        type: String,
        required: true
    },

    email: {
        type: String,
        required: true,
        unique: true
    },

    password: {
        type: String,
        required: true
    },

    role: {
        type: String,
        enum: [...Object.values(ROLES), "admin"],
        default: ROLES.USER
    },

    department: {
        type: String,
        enum: DEPARTMENTS,
        default: "General"
    },

    phoneNumber: {
        type: String,
        default: ""
    },

    whatsappNumber: {
        type: String,
        default: ""
    },

    notificationPreferences: {
        email: { type: Boolean, default: true },
        sms: { type: Boolean, default: false },
        whatsapp: { type: Boolean, default: false }
    },

    emailVerified: {
        type: Boolean,
        default: false
    },

    emailVerificationTokenHash: {
        type: String,
        default: null
    },

    emailVerificationExpiresAt: {
        type: Date,
        default: null
    },

    passwordResetTokenHash: {
        type: String,
        default: null
    },

    passwordResetExpiresAt: {
        type: Date,
        default: null
    },

    twoFactorEnabled: {
        type: Boolean,
        default: false
    },

    twoFactorCodeHash: {
        type: String,
        default: null
    },

    twoFactorCodeExpiresAt: {
        type: Date,
        default: null
    },

    failedLoginAttempts: {
        type: Number,
        default: 0
    },

    lockUntil: {
        type: Date,
        default: null
    },

    createdAt: {
        type: Date,
        default: Date.now
    }

});

userSchema.index({ role: 1, createdAt: -1 });
userSchema.index({ role: 1, department: 1 });
userSchema.index({ emailVerified: 1 });

module.exports = mongoose.model("User", userSchema);
