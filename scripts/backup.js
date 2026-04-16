const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const User = require("../models/User");
const Complaint = require("../models/Complaint");

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/complaint_portal";
const outputDir = path.join(__dirname, "..", "backups", `backup-${Date.now()}`);

const writeJson = (fileName, data) => {
    fs.writeFileSync(path.join(outputDir, fileName), JSON.stringify(data, null, 2), "utf8");
};

const run = async () => {
    await mongoose.connect(MONGO_URI);
    fs.mkdirSync(outputDir, { recursive: true });

    const [users, complaints] = await Promise.all([
        User.find({}).lean(),
        Complaint.find({}).lean()
    ]);

    writeJson("users.json", users);
    writeJson("complaints.json", complaints);
    writeJson("metadata.json", {
        backedUpAt: new Date().toISOString(),
        users: users.length,
        complaints: complaints.length
    });

    await mongoose.disconnect();
    console.log(`Backup completed at ${outputDir}`);
};

run().catch(async error => {
    console.error("Backup failed:", error);
    try {
        await mongoose.disconnect();
    } catch (disconnectError) {
        console.error("Disconnect failed:", disconnectError);
    }
    process.exit(1);
});
