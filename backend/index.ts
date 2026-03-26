import express from "express";
import activeRouter from "./routes/active.js";
import "dotenv/config";
import { connectDB } from "./db.js";
import sessionRouter from "./routes/session.js";
import syncRouter from "./routes/sync.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use("/api/active", activeRouter);
app.use("/api/sessions", sessionRouter);
app.use("/api/syncs", syncRouter);

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
