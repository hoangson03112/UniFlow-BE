import admin from "firebase-admin";
import { User } from "../models/User.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin (chỉ chạy 1 lần)
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

/**
 * Middleware xác thực Firebase token
 * Lưu/update user vào MongoDB và gắn req.user
 */
export const authenticateFirebase = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Missing or invalid Authorization header",
        message: "Please provide Bearer token",
      });
    }

    const token = authHeader.split("Bearer ")[1];

    try {
      // Thử verify ID token trước
      const decodedToken = await admin.auth().verifyIdToken(token);
      const { uid, email, name, picture } = decodedToken;

      // Tạo hoặc update user trong MongoDB
      const user = await User.createOrUpdateFromFirebase({
        uid,
        email,
        displayName: name,
        photoURL: picture,
      });

      req.firebaseUid = uid;
      req.user = user;
      req.userId = user._id.toString();

      next();
    } catch (idTokenError) {
      // Nếu ID token fail, thử verify custom token
      if (idTokenError.code === "auth/argument-error" && token.includes(".")) {
        try {
          const decodedCustomToken = await admin.auth().verifyIdToken(token);
          const { uid, email, name, picture } = decodedCustomToken;

          // Tạo hoặc update user trong MongoDB
          const user = await User.createOrUpdateFromFirebase({
            uid,
            email,
            displayName: name,
            photoURL: picture,
          });

          req.firebaseUid = uid;
          req.user = user;
          req.userId = user._id.toString();

          next();
        } catch (customTokenError) {
          throw customTokenError;
        }
      } else {
        throw idTokenError;
      }
    }
  } catch (error) {
    console.error("❌ Firebase auth error:", error.message);

    let errorMessage = "Authentication failed";
    if (error.code === "auth/id-token-expired") {
      errorMessage = "Token expired, please login again";
    } else if (error.code === "auth/invalid-id-token") {
      errorMessage = "Invalid token";
    } else if (error.code === "auth/argument-error") {
      errorMessage = "Invalid token format. Please use Firebase ID token, not custom token";
    }

    return res.status(401).json({
      error: errorMessage,
      code: error.code,
    });
  }
};

/**
 * Optional auth middleware (không bắt buộc login)
 */
export const optionalFirebaseAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      // Không có token, tiếp tục với guest user
      req.user = null;
      req.userId = null;
      return next();
    }

    // Có token, thử verify
    await authenticateFirebase(req, res, next);
  } catch (error) {
    // Lỗi auth, vẫn cho phép tiếp tục với guest
    req.user = null;
    req.userId = null;
    next();
  }
};

/**
 * Middleware kiểm tra user có quyền truy cập resource không
 */
export const requireAuth = (req, res, next) => {
  if (!req.user || !req.userId) {
    return res.status(401).json({
      error: "Authentication required",
      message: "Please login to access this resource",
    });
  }
  next();
};
