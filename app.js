const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");
const connectDB = require("./config/db");
const User = require("./models/User");
const bcrypt = require("bcrypt");
const logger = require("./services/logger");
const { startMonitor, getSnapshot } = require("./services/monitorService");
const { startSlaScheduler } = require("./services/slaService");
const { consumeFlash } = require("./utils/flash");
const { normalizeRole, ROLES } = require("./constants/roles");

const userRoutes = require("./routes/userRoutes");
const complaintRoutes = require("./routes/complaintRoutes");
const adminRoutes = require("./routes/adminRoutes");
const { renderHomePage, renderNotFoundPage } = require("./views/templates");

const session = require("express-session");
const MongoStore = require("connect-mongo");
const dotenv = require("dotenv");
const helmet = require("helmet");
const morgan = require("morgan");
const csrf = require("csurf");

dotenv.config();

const app = express();

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/complaint_portal";
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const SESSION_MAX_AGE = Number(process.env.SESSION_MAX_AGE_MS) || 1000 * 60 * 60;

if (!process.env.SESSION_SECRET) {
    logger.warn("session.secret_missing");
}

if (process.env.NODE_ENV !== "test") {
    connectDB(MONGO_URI);
}

const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many attempts, try again later"
});

app.use(helmet());
if (process.env.NODE_ENV === "production") {
    const logStream = fs.createWriteStream(path.join(__dirname, "access.log"), { flags: "a" });
    app.use(morgan("combined", { stream: logStream }));
} else {
    app.use(morgan("dev"));
}
app.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
    next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== "test") {
    app.use("/login", authRateLimiter);
    app.use("/register", authRateLimiter);
    app.use("/forgot-password", authRateLimiter);
}

app.use(express.static(path.join(__dirname, "public")));

const sessionConfig = {
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: SESSION_MAX_AGE,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production"
    }
};

if (process.env.NODE_ENV !== "test") {
    sessionConfig.store = MongoStore.create({
        mongoUrl: MONGO_URI,
        ttl: SESSION_MAX_AGE / 1000
    });
}

app.use(session(sessionConfig));

const csrfProtection = csrf();
app.use((req, res, next) => {
    // Multipart complaint submissions are parsed by multer in the route.
    // Skip global CSRF check here and validate in that route after parsing.
    if (req.method === "POST" && req.path === "/complaint") {
        return next();
    }
    return csrfProtection(req, res, next);
});
app.use((req, res, next) => {
    if (req.session?.role) {
        req.session.role = normalizeRole(req.session.role);
    }
    next();
});

const createAdminUser = async () => {
    const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

    if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
        logger.warn("admin.seed_skipped_missing_env");
        return;
    }

    if (ADMIN_PASSWORD.length < 12) {
        logger.warn("admin.seed_skipped_weak_password");
        return;
    }

    const existingAdmin = await User.findOne({ email: ADMIN_EMAIL });
    if (existingAdmin) {
        return;
    }

    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await User.create({
        name: ADMIN_NAME,
        email: ADMIN_EMAIL,
        password: hashedPassword,
        role: ROLES.SUPER_ADMIN,
        department: "General",
        emailVerified: true
    });

    logger.info("admin.seed_created", { email: ADMIN_EMAIL });
};

if (process.env.NODE_ENV !== "test") {
    createAdminUser().catch(err => logger.error("admin.seed_error", err));
    startMonitor();
    startSlaScheduler();
}

app.get("/health", async (req, res) => {
    const dbState = mongoose.connection.readyState;
    const isConnected = dbState === 1;

    res.status(isConnected ? 200 : 503).json({
        status: isConnected ? "ok" : "degraded",
        db: isConnected ? "connected" : "disconnected",
        uptime: process.uptime(),
        requestId: req.requestId
    });
});

app.get("/metrics", (req, res) => {
    res.json(getSnapshot());
});

app.use("/", userRoutes);
app.use("/", complaintRoutes);
app.use("/", adminRoutes);

app.get("/", (req, res) => {
    res.send(renderHomePage({ flash: consumeFlash(req) }));
});

app.use((req, res) => {
    res.status(404).send(renderNotFoundPage({ message: "Page not found" }));
});

// Express requires the 4th parameter for error middleware signature.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    logger.error("request.error", err, { requestId: req.requestId });
    if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).send("Attachment too large. Max file size is 5MB.");
    }
    if (err.code === "EBADCSRFTOKEN") {
        return res.status(403).send("Invalid CSRF token");
    }
    res.status(500).send("Internal Server Error");
});

if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        logger.info("server.started", { port: PORT });
    });
}

module.exports = app;
