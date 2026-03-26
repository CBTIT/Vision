import express from "express";
import cors from "cors";
import activeRouter from "./routes/active.js";
import "dotenv/config";
import { connectDB } from "./db.js";
import sessionRouter from "./routes/session.js";
import syncRouter from "./routes/sync.js";
import overviewRouter from "./routes/overview.js";
import pluginRouter from "./routes/plugin.js";
import usersRouter from "./routes/users.js";
import modelsRouter from "./routes/models.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  cors({
    origin: "http://localhost:5173", // your frontend URL
    credentials: true,
  }),
);

app.use(express.json());
app.use("/api/active", activeRouter);
app.use("/api/sessions", sessionRouter);
app.use("/api/syncs", syncRouter);
app.use("/api/overview", overviewRouter);
app.use("/api/plugins", pluginRouter);
app.use("/api/users", usersRouter);
app.use("/api/models", modelsRouter);

const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`Server listening on ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server: ", err);
    process.exit(1);
  }
};

startServer();
