import "dotenv/config";
import { connectMongoose } from "./config/db/index.js";
import { createApp } from "./app.js";

// Models
import "./models/User.js";
import "./models/Task.js";
import "./models/LearningGoal.js";


await connectMongoose();
const app = createApp();
const PORT = process.env.PORT || 8000;
app.listen(PORT, () =>
  console.log(`🚀 UniFlow API on http://localhost:${PORT}`)
);
