const User = require("../models/User");
const logger = require("./logger");
const { sendEmail } = require("./emailService");

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const TWILIO_SMS_FROM = process.env.TWILIO_SMS_FROM || "";
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || "";

const sendTwilioMessage = async ({ to, body, channel }) => {
    if (!TWILIO_SID || !TWILIO_TOKEN) {
        logger.warn("notifications.twilio_not_configured", { channel, to });
        return { sent: false, reason: "twilio_not_configured" };
    }

    const from = channel === "whatsapp" ? TWILIO_WHATSAPP_FROM : TWILIO_SMS_FROM;
    if (!from || !to) {
        return { sent: false, reason: "missing_from_or_to" };
    }

    const payload = new URLSearchParams();
    payload.set("From", channel === "whatsapp" ? `whatsapp:${from}` : from);
    payload.set("To", channel === "whatsapp" ? `whatsapp:${to}` : to);
    payload.set("Body", body);

    const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString("base64");
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: payload
    });

    const data = await response.json();
    if (!response.ok) {
        logger.error("notifications.twilio_error", new Error(data.message || "Twilio request failed"), { channel, to });
        return { sent: false, reason: data.message || "twilio_error" };
    }

    return { sent: true, sid: data.sid };
};

const notifyUserByPreferences = async ({ user, subject, message }) => {
    if (!user) {
        return [];
    }

    const results = [];

    if (user.notificationPreferences?.email !== false && user.email) {
        await sendEmail({
            to: user.email,
            subject,
            text: message
        });
        results.push({ type: "email", sentAt: new Date(), message });
    }

    if (user.notificationPreferences?.sms && user.phoneNumber) {
        const sms = await sendTwilioMessage({ to: user.phoneNumber, body: message, channel: "sms" });
        results.push({
            type: "sms",
            sentAt: new Date(),
            message,
            status: sms.sent ? "sent" : "failed",
            reason: sms.reason || null
        });
    }

    if (user.notificationPreferences?.whatsapp && user.whatsappNumber) {
        const wa = await sendTwilioMessage({ to: user.whatsappNumber, body: message, channel: "whatsapp" });
        results.push({
            type: "whatsapp",
            sentAt: new Date(),
            message,
            status: wa.sent ? "sent" : "failed",
            reason: wa.reason || null
        });
    }

    return results;
};

const notifyComplaintOwner = async ({ complaint, subject, message }) => {
    const owner = await User.findById(complaint.userId);
    if (!owner) {
        return [];
    }
    return notifyUserByPreferences({ user: owner, subject, message });
};

module.exports = {
    notifyUserByPreferences,
    notifyComplaintOwner
};
