const { ADMIN_ROLES, STAFF_ROLES, normalizeRole } = require("../constants/roles");

const ensureAuthenticated = (req, res, next) => {
    if (req.session && req.session.userId) {
        req.session.role = normalizeRole(req.session.role);
        return next();
    }
    return res.redirect("/login");
};

const authorizeRoles = roles => (req, res, next) => {
    if (!req.session || !req.session.userId) {
        return res.redirect("/login");
    }

    const role = normalizeRole(req.session.role);
    req.session.role = role;
    if (roles.includes(role)) {
        return next();
    }
    return res.status(403).send("Forbidden: Insufficient role");
};

const defaultRouteForRole = role => {
    const normalized = normalizeRole(role);
    return STAFF_ROLES.includes(normalized) ? "/admin" : "/dashboard";
};

module.exports = {
    ensureAuthenticated,
    ensureAdmin: authorizeRoles(ADMIN_ROLES),
    ensureStaff: authorizeRoles(STAFF_ROLES),
    authorizeRoles,
    defaultRouteForRole,
    ensureGuest: (req, res, next) => {
        if (req.session && req.session.userId) {
            return res.redirect(defaultRouteForRole(req.session.role));
        }
        return next();
    }
};
