const crypto = require("crypto");

const createToken = (size = 32) => crypto.randomBytes(size).toString("hex");

const hashToken = token => crypto.createHash("sha256").update(token).digest("hex");

const createOtpCode = () => String(Math.floor(100000 + Math.random() * 900000));

module.exports = {
    createToken,
    hashToken,
    createOtpCode
};
