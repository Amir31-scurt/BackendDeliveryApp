import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

dotenv.config();

// Enhanced auth middleware
export const authMiddleware = async (req, res, next) => {
  try {
    // Skip authentication for login page and login POST request
    if (req.originalUrl === '/admin/login' || req.originalUrl.startsWith('/admin/login')) {
      return next();
    }

    // For page renders, check token in cookies or localStorage
    if (!req.xhr && !req.headers.accept?.includes('application/json')) {
      const token = req.cookies.token || req.headers.authorization?.split(" ")[1];

      if (!token) {
        console.log("No token found for page render, redirecting to login");
        return res.redirect('/admin/login/restaurant');
      }

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = {
          userId: decoded.id,
          role: decoded.role
        };
        return next();
      } catch (err) {
        console.log("Invalid token for page render, redirecting to login");
        return res.redirect('/admin/login/restaurant');
      }
    }

    // For API requests, check CSRF token and Authorization header
    if (req.method !== 'GET') {
      const csrfToken = req.headers['x-csrf-token'];
      if (!csrfToken) {
        return res.status(403).json({ error: "CSRF token missing" });
      }
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Authorization header must be provided" });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({ error: "Authentication token must be provided" });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = {
        userId: decoded.id,
        role: decoded.role
      };
      next();
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: "Token expired" });
      }
      return res.status(401).json({ error: "Invalid token" });
    }
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Role-based middleware
export const requireRole = (roles) => {
  return (req, res, next) => {
    // For page renders, we don't need to check roles
    if (!req.xhr && !req.headers.accept?.includes('application/json')) {
      return next();
    }

    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    next();
  };
};

export default {
  authMiddleware,
  requireRole
};
