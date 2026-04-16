const path = require("path");
const fs = require("fs");
const multer = require("multer");

const uploadDir = path.join(__dirname, "..", "uploads", "complaints");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
        cb(null, `${Date.now()}-${safeName}`);
    }
});

const allowedMimeTypes = ["image/jpeg", "image/png", "application/pdf"];

const fileFilter = (req, file, cb) => {
    if (!allowedMimeTypes.includes(file.mimetype)) {
        return cb(new Error("Only JPG, PNG, and PDF files are allowed"));
    }
    cb(null, true);
};

const complaintAttachmentUpload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 5
    },
    fileFilter
});

module.exports = {
    complaintAttachmentUpload
};
