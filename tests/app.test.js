const request = require("supertest");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const app = require("../app");
const User = require("../models/User");
const Complaint = require("../models/Complaint");

const extractCsrfToken = html => {
    const match = html.match(/name="_csrf" value="([^"]+)"/);
    return match ? match[1] : null;
};

const extractCaptchaQuestion = html => {
    const match = html.match(/CAPTCHA:\s*([0-9]+\s\+\s[0-9]+\s=\s\?)/);
    return match ? match[1] : null;
};

const solveCaptcha = question => {
    if (!question) {
        return "";
    }
    const parts = question.match(/([0-9]+)\s\+\s([0-9]+)/);
    if (!parts) {
        return "";
    }
    return String(Number(parts[1]) + Number(parts[2]));
};

const getPage = async (agent, path) => {
    const response = await agent.get(path);
    expect(response.statusCode).toBe(200);
    return response;
};

const getCsrfToken = async (agent, path) => {
    const response = await getPage(agent, path);
    const token = extractCsrfToken(response.text);
    expect(token).toBeTruthy();
    return token;
};

const loginAs = async (agent, role = "user", options = {}) => {
    const password = options.password || "secret123";
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = {
        _id: new mongoose.Types.ObjectId(),
        name: role === "super_admin" ? "Admin User" : "Normal User",
        email: role === "super_admin" ? "admin@test.com" : "user@test.com",
        password: hashedPassword,
        role,
        emailVerified: options.emailVerified ?? true,
        twoFactorEnabled: options.twoFactorEnabled ?? false,
        failedLoginAttempts: 0,
        lockUntil: null,
        save: jest.fn().mockResolvedValue({})
    };

    jest.spyOn(User, "findOne").mockResolvedValue(user);

    const loginPage = await getPage(agent, "/login");
    const csrfToken = extractCsrfToken(loginPage.text);
    const captchaQuestion = extractCaptchaQuestion(loginPage.text);
    const captchaAnswer = solveCaptcha(captchaQuestion);

    const response = await agent.post("/login").send({
        _csrf: csrfToken,
        email: user.email,
        password,
        captchaAnswer
    });

    return { response, user };
};

describe("Core Pages", () => {
    beforeEach(() => {
        jest.restoreAllMocks();
    });

    it("GET /health returns service and db status", async () => {
        const res = await request(app).get("/health");

        expect([200, 503]).toContain(res.statusCode);
        expect(res.body).toHaveProperty("status");
        expect(res.body).toHaveProperty("db");
        expect(res.body).toHaveProperty("uptime");
        expect(res.body).toHaveProperty("requestId");
    });

    it("GET / renders homepage", async () => {
        const res = await request(app).get("/");
        expect(res.statusCode).toBe(200);
        expect(res.text).toContain("Centralized Public Grievance");
    });

    it("GET /dashboard redirects unauthenticated users to /login", async () => {
        const res = await request(app).get("/dashboard");
        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toBe("/login");
    });
});

describe("Auth Flows and Security", () => {
    beforeEach(() => {
        jest.restoreAllMocks();
    });

    it("re-renders register page with validation errors", async () => {
        const agent = request.agent(app);
        const csrfToken = await getCsrfToken(agent, "/register");

        const res = await agent.post("/register").send({
            _csrf: csrfToken,
            name: "",
            email: "bad-email",
            password: "123"
        });

        expect(res.statusCode).toBe(400);
        expect(res.text).toContain("Name is required");
        expect(res.text).toContain("Invalid email");
    });

    it("registers a user and redirects to verify-email sent page", async () => {
        const agent = request.agent(app);
        const csrfToken = await getCsrfToken(agent, "/register");

        jest.spyOn(User, "findOne").mockResolvedValue(null);
        jest.spyOn(User.prototype, "save").mockResolvedValue({});

        const res = await agent.post("/register").send({
            _csrf: csrfToken,
            name: "Test User",
            email: "new-user@test.com",
            password: "password123"
        });

        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toBe("/verify-email/sent");
    });

    it("blocks login for unverified email users", async () => {
        const agent = request.agent(app);
        const { response } = await loginAs(agent, "user", { emailVerified: false });

        expect(response.statusCode).toBe(403);
        expect(response.text).toContain("Please verify your email before logging in.");
    });

    it("allows legacy users with undefined emailVerified field to login", async () => {
        const agent = request.agent(app);
        const password = "secret123";
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = {
            _id: new mongoose.Types.ObjectId(),
            name: "Legacy User",
            email: "legacy@test.com",
            password: hashedPassword,
            role: "user",
            save: jest.fn().mockResolvedValue({})
        };
        jest.spyOn(User, "findOne").mockResolvedValue(user);

        const loginPage = await getPage(agent, "/login");
        const csrfToken = extractCsrfToken(loginPage.text);
        const captchaQuestion = extractCaptchaQuestion(loginPage.text);

        const response = await agent.post("/login").send({
            _csrf: csrfToken,
            email: user.email,
            password,
            captchaAnswer: solveCaptcha(captchaQuestion)
        });

        expect(response.statusCode).toBe(302);
        expect(response.headers.location).toBe("/dashboard");
    });

    it("enforces captcha validation on login", async () => {
        const agent = request.agent(app);
        const password = "secret123";
        const user = {
            _id: new mongoose.Types.ObjectId(),
            name: "Normal User",
            email: "user@test.com",
            password: await bcrypt.hash(password, 10),
            role: "user",
            emailVerified: true,
            save: jest.fn().mockResolvedValue({})
        };
        jest.spyOn(User, "findOne").mockResolvedValue(user);

        const loginPage = await getPage(agent, "/login");
        const csrfToken = extractCsrfToken(loginPage.text);

        const res = await agent.post("/login").send({
            _csrf: csrfToken,
            email: user.email,
            password,
            captchaAnswer: "wrong"
        });

        expect(res.statusCode).toBe(400);
        expect(res.text).toContain("Invalid CAPTCHA answer");
    });

    it("requires 2FA verification when enabled", async () => {
        const randomSpy = jest.spyOn(Math, "random").mockReturnValue(0);
        const agent = request.agent(app);

        const { response } = await loginAs(agent, "user", { twoFactorEnabled: true });
        expect(response.statusCode).toBe(302);
        expect(response.headers.location).toBe("/2fa");

        const csrfToken = await getCsrfToken(agent, "/2fa");
        const verifyRes = await agent.post("/2fa/verify").send({
            _csrf: csrfToken,
            code: "100000"
        });

        expect(verifyRes.statusCode).toBe(302);
        expect(verifyRes.headers.location).toBe("/dashboard");
        randomSpy.mockRestore();
    });

    it("supports public resend verification flow from login", async () => {
        const agent = request.agent(app);
        const loginPage = await getPage(agent, "/login");
        const csrfToken = extractCsrfToken(loginPage.text);

        const user = {
            _id: new mongoose.Types.ObjectId(),
            name: "Pending User",
            email: "pending@test.com",
            emailVerified: false,
            save: jest.fn().mockResolvedValue({})
        };
        jest.spyOn(User, "findOne").mockResolvedValue(user);

        const response = await agent.post("/verify-email/resend-public").send({
            _csrf: csrfToken,
            email: "pending@test.com"
        });

        expect(response.statusCode).toBe(302);
        expect(response.headers.location).toBe("/login");
    });
});

describe("Complaint and Admin Access", () => {
    beforeEach(() => {
        jest.restoreAllMocks();
    });

    it("allows authenticated users to create complaints", async () => {
        const agent = request.agent(app);
        const loginResult = await loginAs(agent, "user");
        expect(loginResult.response.statusCode).toBe(302);
        expect(loginResult.response.headers.location).toBe("/dashboard");

        jest.spyOn(Complaint.prototype, "save").mockResolvedValue({});
        const listSortMock = jest.fn().mockResolvedValue([]);
        jest.spyOn(Complaint, "find").mockReturnValue({ sort: listSortMock });

        const csrfToken = await getCsrfToken(agent, "/complaint");
        const res = await agent.post("/complaint").send({
            _csrf: csrfToken,
            title: "Water Supply Issue",
            description: "No water in my area for 2 days.",
            category: "Utilities",
            priority: "High"
        });

        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toBe("/dashboard");
    });

    it("returns 403 for non-staff users trying to access /admin", async () => {
        const agent = request.agent(app);
        await loginAs(agent, "user");

        const res = await agent.get("/admin");
        expect(res.statusCode).toBe(403);
        expect(res.text).toContain("Forbidden: Insufficient role");
    });

    it("renders complaint history for complaint owner", async () => {
        const agent = request.agent(app);
        const { user } = await loginAs(agent, "user");
        const complaintId = new mongoose.Types.ObjectId();
        const complaintDoc = {
            _id: complaintId,
            title: "Broken Street Light",
            description: "Light is off",
            category: "Infrastructure",
            priority: "Medium",
            status: "Pending",
            adminRemark: "",
            userId: user._id.toString(),
            statusLogs: []
        };
        jest.spyOn(Complaint, "findById").mockReturnValue({
            populate: jest.fn().mockResolvedValue(complaintDoc)
        });

        const res = await agent.get(`/complaint/${complaintId}/history`);
        expect(res.statusCode).toBe(200);
        expect(res.text).toContain("Complaint History");
        expect(res.text).toContain("Status Timeline");
    });
});

describe("Search, Export and Status Update Coverage", () => {
    beforeEach(() => {
        jest.restoreAllMocks();
    });

    it("supports dashboard search filters", async () => {
        const agent = request.agent(app);
        await loginAs(agent, "user");

        const listQuery = {
            sort: jest.fn().mockReturnThis(),
            skip: jest.fn().mockReturnThis(),
            limit: jest.fn().mockResolvedValue([])
        };
        jest.spyOn(Complaint, "find").mockReturnValue(listQuery);
        jest.spyOn(Complaint, "countDocuments").mockResolvedValue(0);
        jest.spyOn(Complaint, "aggregate").mockResolvedValue([]);
        const csrfToken = await getCsrfToken(agent, "/dashboard");

        const res = await agent.post("/dashboard/search").send({
            _csrf: csrfToken,
            title: "water",
            category: "Utilities",
            status: "Pending"
        });

        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toContain("/dashboard?");
        expect(res.headers.location).toContain("title=water");
        expect(res.headers.location).toContain("category=Utilities");
        expect(res.headers.location).toContain("status=Pending");
    });

    it("supports admin search and status update", async () => {
        const agent = request.agent(app);
        await loginAs(agent, "super_admin");

        const adminListQuery = {
            populate: jest.fn().mockReturnThis(),
            sort: jest.fn().mockReturnThis(),
            skip: jest.fn().mockReturnThis(),
            limit: jest.fn().mockResolvedValue([])
        };
        jest.spyOn(Complaint, "find").mockReturnValue(adminListQuery);
        jest.spyOn(Complaint, "countDocuments").mockResolvedValue(0);
        jest.spyOn(User, "find").mockReturnValue({
            select: jest.fn().mockResolvedValue([])
        });
        const csrfToken = await getCsrfToken(agent, "/admin");

        const searchRes = await agent.post("/admin/search").send({
            _csrf: csrfToken,
            title: "road",
            category: "Infrastructure",
            status: "In Progress",
            dateFrom: "2026-01-01",
            dateTo: "2026-01-31"
        });

        expect(searchRes.statusCode).toBe(302);
        expect(searchRes.headers.location).toContain("/admin?");

        const complaintDoc = {
            _id: new mongoose.Types.ObjectId(),
            status: "Pending",
            adminRemark: "",
            statusLogs: [],
            notificationsSent: [],
            save: jest.fn().mockResolvedValue({})
        };
        jest.spyOn(Complaint, "findById").mockResolvedValue(complaintDoc);
        jest.spyOn(User, "findById").mockResolvedValue({
            email: "owner@test.com",
            notificationPreferences: { email: false, sms: false, whatsapp: false }
        });

        const updateRes = await agent.post(`/update/${complaintDoc._id}`).send({
            _csrf: csrfToken,
            status: "Resolved",
            remark: "Completed"
        });

        expect(updateRes.statusCode).toBe(302);
        expect(updateRes.headers.location).toBe("/admin");
        expect(complaintDoc.save).toHaveBeenCalled();
    });

    it("exports csv and pdf for admin roles", async () => {
        const agent = request.agent(app);
        await loginAs(agent, "super_admin");

        const fakeComplaint = {
            title: "Sample",
            category: "Utilities",
            priority: "Low",
            status: "Pending",
            description: "desc",
            date: new Date("2026-01-01"),
            deadline: new Date("2026-01-08"),
            adminRemark: ""
        };
        const sortMock = jest.fn().mockResolvedValue([fakeComplaint]);
        jest.spyOn(Complaint, "find").mockReturnValue({ sort: sortMock });

        const csvRes = await agent.get("/admin/export/csv");
        expect(csvRes.statusCode).toBe(200);
        expect(csvRes.headers["content-type"]).toContain("text/csv");

        const pdfRes = await agent.get("/admin/export/pdf");
        expect(pdfRes.statusCode).toBe(200);
        expect(pdfRes.headers["content-type"]).toContain("application/pdf");
    });
});
