import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";

export const guestInit = [
  cookieParser(),
  (req, res, next) => {
    const SECRET = process.env.APP_SECRET || "dev-secret";
    const hdr = req.headers.authorization;
    const bearer = hdr?.startsWith("Bearer ") ? hdr.slice(7) : null;
    const token = req.cookies.uf_jwt || bearer;
    let uid = null;
    if (token) {
      try {
        uid = jwt.verify(token, SECRET).uid;
      } catch (e) {}
    }
    if (!uid) {
      uid = crypto.randomUUID();
      const t = jwt.sign({ uid }, SECRET, { expiresIn: "180d" });
      res.cookie("uf_jwt", t, {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        maxAge: 180 * 24 * 3600 * 1000,
      });
    }
    req.uid = uid;
    next();
  },
];
