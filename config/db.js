const mongoose = require("mongoose");

const connectDB = async (mongoUri) => {
    try {
        await mongoose.connect(mongoUri);

        console.log("MongoDB Connected Successfully");
    } catch (error) {
        console.log("MongoDB Connection Failed");
        console.log(error);
        if (process.env.NODE_ENV !== "test") {
            process.exit(1);
        }
    }
};

module.exports = connectDB;
