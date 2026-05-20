import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import activeRouter from "./routes/active.js";
import "dotenv/config";
import { connectDB } from "./db.js";
import sessionRouter from "./routes/session.js";
import syncRouter from "./routes/sync.js";
import overviewRouter from "./routes/overview.js";
import pluginRouter from "./routes/plugin.js";
import usersRouter from "./routes/users.js";
import modelsRouter from "./routes/models.js";
import cloudRouter from "./routes/cloud.js";
import authRouter from "./routes/auth.js";
import autodeskRouter from "./routes/autodesk.js";
import { oauthCallbackController } from "./controllers/autodeskController.js";
const app = express();
const PORT = process.env.PORT || 3000;
const allowedOrigins = (process.env.FRONTEND_URLS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? []).concat(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL.trim()] : []);
if (allowedOrigins.length === 0) {
    allowedOrigins.push("http://localhost:5173");
}
app.use(cors({
    origin: (origin, callback) => {
        // Allow non-browser requests (no Origin header) and configured frontend origins.
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
}));
app.use(express.json());
app.use(cookieParser());
app.use("/api/auth", authRouter);
app.use("/api/active", activeRouter);
app.use("/api/sessions", sessionRouter);
app.use("/api/syncs", syncRouter);
app.use("/api/overview", overviewRouter);
app.use("/api/plugins", pluginRouter);
app.use("/api/users", usersRouter);
app.use("/api/models", modelsRouter);
app.use("/api/cloud", cloudRouter);
app.use("/api/autodesk", autodeskRouter);
app.get("/auth/callback", oauthCallbackController);
const startServer = async () => {
    try {
        await connectDB();
        app.listen(PORT, () => {
            console.log(`Server listening on ${PORT}`);
        });
    }
    catch (err) {
        console.error("Failed to start server: ", err);
        process.exit(1);
    }
};
startServer();
