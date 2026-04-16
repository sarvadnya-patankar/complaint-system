module.exports = {
    apps: [
        {
            name: "complaint-portal",
            script: "app.js",
            instances: "max",
            exec_mode: "cluster",
            autorestart: true
        }
    ]
};
