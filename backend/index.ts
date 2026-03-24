import express from "express";
import userRouter from "./routes/users.js";
import "dotenv/config";
import { connectDB } from "./db.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use("/api/users", userRouter);

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
