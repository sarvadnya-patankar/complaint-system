const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const User = require("../models/User");
const Complaint = require("../models/Complaint");

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/complaint_portal";
const backupDir = process.argv[2];

if (!backupDir) {
    console.error("Usage: node scripts/restore.js <backup-directory>");
    process.exit(1);
}

const readJson = fileName => {
    const fullPath = path.join(backupDir, fileName);
    return JSON.parse(fs.readFileSync(fullPath, "utf8"));
};

const run = async () => {
    await mongoose.connect(MONGO_URI);

    const users = readJson("users.json");
    const complaints = readJson("complaints.json");

    await User.deleteMany({});
    await Complaint.deleteMany({});

    if (users.length > 0) {
        await User.insertMany(users, { ordered: false });
    }
    if (complaints.length > 0) {
        await Complaint.insertMany(complaints, { ordered: false });
    }

    await mongoose.disconnect();
    console.log(`Restore completed from ${backupDir}`);
};

run().catch(async error => {
    console.error("Restore failed:", error);
    try {
        await mongoose.disconnect();
    } catch (disconnectError) {
        console.error("Disconnect failed:", disconnectError);
    }
    process.exit(1);
});
