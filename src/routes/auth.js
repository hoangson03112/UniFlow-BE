import { Router } from "express";
import admin from "firebase-admin";
import { User } from "../models/User.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Initialize Firebase Admin (nếu chưa có)
if (!admin.apps.length) {
  try {
    // Sử dụng environment variables
    const serviceAccount = {
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID || "uniflow-1239b",
      private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n') || "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDkn1BYIA/ny8dx\nt4SE/1gkwyHOI9I7tnVdqNOsAnko1V4DHT2hDVaMtlxUNReswdVmbVzo0Jfw8fAc\nde9C40x6047FdoEcGh1BO9lGk+1wSS0HpsFRqm5P62QaN1adm6egSHdEb9k+pM5R\nteXGDHNhdVrHKULbgxY2VahNRjoZOP0xYiqxDzGjc4hyNNOSCNJfCWXls+FpUEw8\ngXpYyijyDNP4eK+l2xf/zszn2Iq9EWZL9mX6Vf81ikK+6PSD/8cuYjjbbikA1hA9\npQjimNzSd/vRtNREIdqFhbyodYkxCyfXZlf0BKcjcC5mSTlvAszbfqvL8pIw4cGV\nLbNamlh7AgMBAAECggEAI2ro5ADHkLCEQSzd4KARiX8aAsOQOK70sgygX4KclC5b\nMPP74weGySghLUHHsqbusT5aXo5I06DE2BaPI+zETDeaY83kL4nTeWfU/7bqrvKv\nLAMclNMTNtoFI9M/Mw3KTgLxSHlkDZfeMftnfCMxUWpVpLVS2ws3oDWXQVgSp8Be\nQWqQYTApTL6nIwf8IlCXbGsgvHOb69hz4bJnANy0KjNpHHevPuWtWIQngjNbXZt5\n0hxiyF9HXcjcaTQUwXzWf6ki6f4sP8CivHSiOLOFMbRDFuvqs5XVzz9kvC07fVww\nP6hSOQtcZ39gHbt9nV/WXe8r6bSJttH8ntuwf7gsCQKBgQD4UfRLawEKCU8HzC/g\nIBKpoqF0t0Lu9shHENXlK2OZnT5CqFuf9Gdz5potf6xzOOzyQuS3v+qykbKcz382\nr+rwAHXjeavbOqlphMBypFkybY4AU2chgZLssuhKZDDjeuJYUfUEqcV1biL5+iK2\nWvPgjluczWJRK+I1N275TH5SEwKBgQDrsWeIGJnFzAKKmXWaAWf40/FNqIWSVrfz\nol186gjVCzMDzqmbREhe6s+FD7BmWLBgE2strFu7Un+ZEvlrdGbwkyPFLRVb4jL+\nNvgpXccXg2ZLtpuNxA/WV3LykLyPSgnslcNgdaw5Ot1nh6G274cXBUqD0jQq/4Rz\nspSL2gHs+QKBgEBB/OSTQQaW2BOde/oUcp/hDMTGM5Tg2XzCV4dhDfoPXbAkHumq\ndibg0p7ZfgenAHHEa6k9CX/CAiVf8Hx3U2VdySPfNWCasoIyrxY7fzV0ch2Vd4eN\nHzcPKNsvSBNlljLiqnPVdtpncLedSeREbv15+Sz/XOTCZVv+B0KNz9ZvAoGBAJqA\ni97CSaNI7e2PVXEkNNT/knIW46CfaiyypdgpzqphkgqP4czfgRV/lZOjSj59KvmA\nIUUqdGOiW/SrZIdVIdnYip1JxXObH1RYEmuDhuxZ/afqR6Qx/zPB1Z8+0+yWW1UU\ng6Pq34AQn2yrk43JDORBWqx5EiuRnnD9grT+rz55AoGBAN9BU9KYNNcRNjdIvEZm\n1UV8F0t1L7VHdFCzA0UCrn939vb/pg06qyvXtAiHiEZ6W2WkwQAomnzMeh13mPyQ\nXHR1Ar4XR+S9jspYn3ULMwkeDxC1L5y1laSJz5pKTrzt/bwN2lHFmA5lUutk/4qr\nuJA7e1o8o363Ygtoe/zJizPs\n-----END PRIVATE KEY-----\n",
      client_email: process.env.FIREBASE_CLIENT_EMAIL || "firebase-adminsdk-fbsvc@uniflow-1239b.iam.gserviceaccount.com",
    };

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });
    console.log("✅ Firebase Admin initialized with environment variables");
  } catch (error) {
    console.error("❌ Failed to initialize Firebase with env vars:", error.message);
    // Fallback to application default
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID || "uniflow-1239b",
    });
    console.log("✅ Firebase Admin initialized with application default credentials");
  }
}

// POST /api/auth/login - Verify Firebase token và tạo/update user
router.post("/login", async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        error: "Missing idToken",
        message: "Please provide Firebase ID token",
      });
    }

    // Verify Firebase ID token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { uid, email, name, picture } = decodedToken;

    // Tạo hoặc update user trong MongoDB
    const user = await User.createOrUpdateFromFirebase({
      uid,
      email,
      displayName: name,
      photoURL: picture,
    });

    // Trả về thông tin user (không tạo custom token)
    res.json({
      success: true,
      message: "Login successful",
      user: {
        id: user._id.toString(),
        firebaseUid: user.firebaseUid,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        settings: user.settings,
        lastLoginAt: user.lastLoginAt,
        loginCount: user.loginCount,
      },
    });
  } catch (error) {
    console.error("❌ Auth login error:", error);

    let errorMessage = "Authentication failed";
    let statusCode = 401;

    if (error.code === "auth/id-token-expired") {
      errorMessage = "Token expired, please login again";
    } else if (error.code === "auth/invalid-id-token") {
      errorMessage = "Invalid token";
    } else if (error.code === "auth/project-not-found") {
      errorMessage = "Firebase project configuration error";
      statusCode = 500;
    }

    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      code: error.code,
    });
  }
});

// POST /api/auth/verify - Verify token (dùng cho middleware)
router.post("/verify", async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        error: "Missing idToken",
      });
    }

    // Verify Firebase ID token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const user = await User.findByFirebaseUid(decodedToken.uid);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found in database",
      });
    }

    res.json({
      success: true,
      valid: true,
      user: {
        id: user._id.toString(),
        firebaseUid: user.firebaseUid,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    console.error("❌ Auth verify error:", error);

    res.status(401).json({
      success: false,
      valid: false,
      error: "Token verification failed",
      code: error.code,
    });
  }
});

// GET /api/auth/me - Lấy thông tin user hiện tại
router.get("/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error: "Missing authorization header",
      });
    }

    const idToken = authHeader.split("Bearer ")[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const user = await User.findByFirebaseUid(decodedToken.uid);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Get user stats
    const stats = await user.getStats();

    res.json({
      success: true,
      user: {
        id: user._id.toString(),
        firebaseUid: user.firebaseUid,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        settings: user.settings,
        lastLoginAt: user.lastLoginAt,
        loginCount: user.loginCount,
        stats: stats,
      },
    });
  } catch (error) {
    console.error("❌ Get user info error:", error);

    res.status(401).json({
      success: false,
      error: "Authentication failed",
      code: error.code,
    });
  }
});

// POST /api/auth/logout - Logout (optional, chỉ để tracking)
router.post("/logout", async (req, res) => {
  try {
    // Có thể log logout event hoặc update last activity
    res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("❌ Logout error:", error);
    res.status(500).json({
      success: false,
      error: "Logout failed",
    });
  }
});

// POST /api/auth/refresh - Refresh Firebase token (deprecated - use client-side refresh)
router.post("/refresh", async (req, res) => {
  res.status(400).json({
    success: false,
    error: "Deprecated endpoint",
    message: "Please refresh token on client side using Firebase Auth",
  });
});

// POST /api/auth/convert-token - Convert custom token to ID token
router.post("/convert-token", async (req, res) => {
  try {
    const { customToken } = req.body;

    if (!customToken) {
      return res.status(400).json({
        success: false,
        error: "Missing customToken",
        message: "Please provide custom token",
      });
    }

    // Verify custom token và lấy thông tin user
    const decodedToken = await admin.auth().verifyIdToken(customToken);
    const { uid, email, name, picture } = decodedToken;

    // Tạo hoặc update user trong MongoDB
    const user = await User.createOrUpdateFromFirebase({
      uid,
      email,
      displayName: name,
      photoURL: picture,
    });

    // Trả về thông tin user (không tạo token mới)
    res.json({
      success: true,
      message: "Token converted successfully",
      user: {
        id: user._id.toString(),
        firebaseUid: user.firebaseUid,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        settings: user.settings,
        lastLoginAt: user.lastLoginAt,
        loginCount: user.loginCount,
      },
    });
  } catch (error) {
    console.error("❌ Convert token error:", error);

    res.status(401).json({
      success: false,
      error: "Token conversion failed",
      message: "Invalid custom token",
      code: error.code,
    });
  }
});

export default router;
