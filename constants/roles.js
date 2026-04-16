const ROLES = {
    USER: "user",
    AGENT: "agent",
    DEPARTMENT_ADMIN: "department_admin",
    SUPER_ADMIN: "super_admin"
};

const STAFF_ROLES = [ROLES.AGENT, ROLES.DEPARTMENT_ADMIN, ROLES.SUPER_ADMIN];
const ADMIN_ROLES = [ROLES.DEPARTMENT_ADMIN, ROLES.SUPER_ADMIN];

const normalizeRole = role => {
    if (role === "admin") {
        return ROLES.SUPER_ADMIN;
    }
    return role;
};

module.exports = {
    ROLES,
    STAFF_ROLES,
    ADMIN_ROLES,
    normalizeRole
};
