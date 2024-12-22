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

export default authMiddleware;
