import { addMinutes } from "date-fns";
import express from "express";
import { supabase } from "../supabaseClient.js";
import { signIn } from "../utils/auth.js";

const userStore = {};

const router = express.Router();

// Temporary in-memory store for OTPs (use Redis or a database in production)
const otpStore = {};

router.post("/signup", async (req, res) => {
  try {
    const { phoneNumber, name, password } = req.body;

    if (!phoneNumber || !name || !password) {
      return res.status(400).json({ error: "All fields are required." });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000); // 6-digit OTP
    const expiresAt = addMinutes(new Date(), 5); // OTP expires in 5 minutes

    // Store user details and OTP temporarily
    userStore[phoneNumber] = {
      name,
      password, // You should hash this in production
      otp,
      expiresAt,
      isVerified: false,
    };

    // For production, store this in your database
    // await supabase.from('otps').insert({ phone_number: phoneNumber, otp, expires_at: expiresAt });

    // Return OTP for testing (don't send in production)
    res.status(200).json({
      message: "OTP generated successfully.",
      otp, // For testing purposes only; remove in production
    });
  } catch (error) {
    console.error("Signup Error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { phoneNumber, password } = req.body;
    console.log(req.body);
    const { user, session } = await signIn(phoneNumber, password);

    res.status(200).json({
      message: "Login successful",
      user: {
        id: user.id,
        phoneNumber: user.phone,
        role: user.user_metadata.role,
      },
      token: session.access_token,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * Generate OTP
 */
router.post("/generate-otp", async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: "Phone number is required." });
    }

    // Generate OTP and expiration
    const otp = crypto.randomInt(100000, 999999); // 6-digit OTP
    const expiresAt = addMinutes(new Date(), 5); // OTP valid for 5 minutes

    // Store OTP in in-memory store
    otpStore[phoneNumber] = { otp, expiresAt };

    // For production, save to database:
    await supabase
      .from("otps")
      .insert({ phone_number: phoneNumber, otp, expires_at: expiresAt });

    // Return OTP for testing purposes (DON'T return it in production)
    res.status(200).json({
      message: "OTP generated successfully.",
      otp, // For testing, remove in production
    });
  } catch (error) {
    console.error("Error generating OTP:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

/**
 * Verify OTP
 */
router.post("/verify-otp", async (req, res) => {
  try {
    const { phoneNumber, otp } = req.body;

    if (!phoneNumber || !otp) {
      return res
        .status(400)
        .json({ error: "Phone number and OTP are required." });
    }

    // Retrieve user details and OTP
    const userData = userStore[phoneNumber];

    if (!userData) {
      return res.status(400).json({ error: "Invalid or expired OTP." });
    }

    const { otp: storedOtp, expiresAt, name, password } = userData;

    // Validate OTP
    if (otp !== storedOtp.toString()) {
      return res.status(400).json({ error: "Invalid OTP." });
    }

    // Check expiration
    if (new Date() > expiresAt) {
      return res.status(400).json({ error: "OTP has expired." });
    }

    // Mark user as verified
    userData.isVerified = true;

    // Save user to your database
    const { data, error } = await supabase.from("users").insert({
      phone_number: phoneNumber,
      name,
      password, // You should hash this before saving
      is_verified: true,
    });

    if (error) {
      return res.status(500).json({ error: "Failed to save user." });
    }

    // Clean up temporary store
    delete userStore[phoneNumber];

    res.status(200).json({
      message: "OTP verified and signup completed successfully.",
      user: data,
    });
  } catch (error) {
    console.error("Verify OTP Error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

export default router;
