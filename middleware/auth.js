import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

dotenv.config();

const authMiddleware = async (req) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    throw new Error("Authorization header must be provided");
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    throw new Error("Authentication token must be provided");
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) {
      throw new Error("User not found");
    }
    if (!user.isVerified) {
      throw new Error("User is not verified");
    }
    return { userId: user._id, userRole: user.role };
  } catch (err) {
    throw new Error("Invalid/Expired token");
  }
};

const adminLogin = async (req, res) => {
  const { phoneNumber, password } = req.body; // Use phoneNumber instead of username
  try {
    const user = await User.findOne({ phoneNumber, role: "admin" }); // Check phoneNumber and role
    if (!user) {
      return res.render("admin/login", {
        title: "Login",
        error: "Invalid credentials",
      });
    }
    const isValid = await bcrypt.compare(password, user.password); // Validate password
    if (!isValid) {
      return res.render("admin/login", {
        title: "Login",
        error: "Invalid credentials",
      });
    }
    req.session.user = {
      id: user.id,
      phoneNumber: user.phoneNumber,
      role: user.role,
    };
    res.redirect("/admin");
  } catch (error) {
    console.error("Login error:", error);
    res.render("admin/login", { title: "Login", error: "An error occurred" });
  }
};

export const isAdmin = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1]; // Extract token from `Authorization` header

  if (!token) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET); // Verify the token
    if (decoded.role !== "admin") {
      return res.status(403).json({ error: "Access denied. Admins only." });
    }

    req.user = decoded; // Attach user information to the request object
    next();
  } catch (error) {
    console.error("Token verification failed:", error);
    return res.status(401).json({ error: "Invalid token." });
  }
};

export default { authMiddleware, adminLogin };
