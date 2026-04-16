const mongoose = require("mongoose");
const logger = require("./logger");

const MONITOR_INTERVAL_MS = Number(process.env.MONITOR_INTERVAL_MS) || 60000;

let intervalRef;

const getSnapshot = () => ({
    uptimeSec: Math.floor(process.uptime()),
    rssMb: Math.round((process.memoryUsage().rss / (1024 * 1024)) * 100) / 100,
    heapUsedMb: Math.round((process.memoryUsage().heapUsed / (1024 * 1024)) * 100) / 100,
    dbState: mongoose.connection.readyState
});

const startMonitor = () => {
    if (intervalRef || process.env.NODE_ENV === "test") {
        return;
    }

    intervalRef = setInterval(() => {
        const snapshot = getSnapshot();
        logger.info("monitor.snapshot", snapshot);

        if (snapshot.dbState !== 1) {
            logger.warn("monitor.db_disconnected", snapshot);
        }
    }, MONITOR_INTERVAL_MS);

    intervalRef.unref();
};

module.exports = {
    getSnapshot,
    startMonitor
};
