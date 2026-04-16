const serializeError = error => {
    if (!error) {
        return undefined;
    }
    return {
        message: error.message,
        stack: error.stack,
        name: error.name
    };
};

const log = (level, message, meta = {}) => {
    const payload = {
        ts: new Date().toISOString(),
        level,
        message,
        ...meta
    };

    const line = JSON.stringify(payload);
    if (level === "error") {
        console.error(line);
        return;
    }
    console.log(line);
};

const logger = {
    info: (message, meta) => log("info", message, meta),
    warn: (message, meta) => log("warn", message, meta),
    error: (message, error, meta = {}) => log("error", message, { ...meta, error: serializeError(error) })
};

module.exports = logger;
