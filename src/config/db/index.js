import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

export async function connectMongoose() {
  const uri =
    process.env.MONGODB_URI ||
    "mongodb+srv://hoagsonn3_db_user:123@cluster0.lzn5pgl.mongodb.net/Cluster0";
  const dbName = process.env.MONGODB_DB || "Cluster0";

  if (mongoose.connection.readyState === 1) {
    console.log("✅ MongoDB already connected");
    return;
  }

  try {
    mongoose.set("strictQuery", true);
    await mongoose.connect(uri, {
      dbName,
      retryWrites: true,
      w: "majority",
    });
    console.log("✅ MongoDB Atlas connected:", dbName);
    console.log("🌐 Connection host:", mongoose.connection.host);
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);
    throw error;
  }
}
