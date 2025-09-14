import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import { optionalFirebaseAuth } from "./middleware/firebaseAuth.js";

// Routes
import auth from "./routes/auth.js";
import tasks from "./routes/tasks.js";
import learningGoals from "./routes/learningGoals.js";

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(
    cors({
      origin: [
        "http://localhost:5174",
        "http://localhost:5173",
        "https://web-track-naver-vietnam-ai-hackathon-hoangson03112-3iunl67wn.vercel.app",
      ],
      credentials: true,
    })
  );
  app.use(morgan("dev"));
  app.use(express.json({ limit: "1mb" }));
  app.use(optionalFirebaseAuth);

  app.use("/api/", rateLimit({ windowMs: 60_000, max: 600 }));

  app.get("/api/health", (req, res) => res.json({ ok: true, uid: req.uid }));

  app.use("/api/auth", auth);
  app.use("/api/tasks", tasks);
  app.use("/api/learning-goals", learningGoals);

  app.use((req, res) => res.status(404).json({ error: "Not found" }));

  app.use((err, req, res, next) => {
    console.error("❌", err);
    res
      .status(err.status || 500)
      .json({ error: err.message || "Server error" });
  });

  return app;
}
