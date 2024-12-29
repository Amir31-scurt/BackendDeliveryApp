import bcrypt from "bcrypt";
import { addMinutes } from "date-fns";
import express from "express";
import jwt from "jsonwebtoken";
import { supabase } from "../supabaseClient.js";
import { signIn } from "../utils/auth.js";

const userStore = {};

const router = express.Router();

// Temporary in-memory store for OTPs (use Redis or a database in production)
const otpStore = {};

router.post("/signup", async (req, res) => {
  try {
    const { phoneNumber, name, password, role } = req.body;

    if (!phoneNumber || !name || !password || !role) {
      return res
        .status(400)
        .json({ error: "Tous les champs sont obligatoires." });
    }

    // Check if the phone number already exists in the users table
    const { data: existingUser, error: existingUserError } = await supabase
      .from("users")
      .select("phone_number")
      .eq("phone_number", phoneNumber)
      .single();

    if (existingUser) {
      return res.status(400).json({ error: "Ce numéro est déjà utilisé." });
    }

    if (existingUserError && existingUserError.code !== "PGRST116") {
      console.error("Erreur de vérification du numéro:", existingUserError);
      return res.status(500).json({ error: "Erreur interne du serveur." });
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
      role: "customer",
      isVerified: false,
    };

    // For production, store this in your database
    await supabase
      .from("otps")
      .insert({ phone_number: phoneNumber, otp, expires_at: expiresAt });

    // Return OTP for testing (don't send in production)
    res.status(200).json({
      message: "OTP généré avec succès.",
      otp, // For testing purposes only; remove in production
    });
  } catch (error) {
    console.error("Erreur lors de l'inscription:", error);
    res.status(500).json({ error: "Erreur interne du serveur." });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { phoneNumber, password } = req.body;

    if (!phoneNumber || !password) {
      return res.status(400).json({
        error: "Le numéro de téléphone et le mot de passe sont requis.",
      });
    }

    console.log(req.body);
    const { user } = await signIn(phoneNumber, password);
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: "60d",
    });

    res.status(200).json({
      message: "Connexion réussie.",
      user: {
        id: user.id,
        name: user.name,
        phoneNumber: user.phone,
        role: user.role,
      },
      token: token,
    });
  } catch (error) {
    console.error("Erreur de connexion:", error);
    res.status(400).json({ error: "Échec de la connexion." });
  }
});

/**
 * Generate OTP
 */
// router.post("/generate-otp", async (req, res) => {
//   try {
//     const { phoneNumber } = req.body;

//     if (!phoneNumber) {
//       return res.status(400).json({ error: "Phone number is required." });
//     }

//     // Generate OTP and expiration
//     const otp = crypto.randomInt(100000, 999999); // 6-digit OTP
//     const expiresAt = addMinutes(new Date(), 5); // OTP valid for 5 minutes

//     // Store OTP in in-memory store
//     otpStore[phoneNumber] = { otp, expiresAt };

//     // For production, save to database:
//     await supabase
//       .from("otps")
//       .insert({ phone_number: phoneNumber, otp, expires_at: expiresAt });

//     // Return OTP for testing purposes (DON'T return it in production)
//     res.status(200).json({
//       message: "OTP generated successfully.",
//       otp, // For testing, remove in production
//     });
//   } catch (error) {
//     console.error("Error generating OTP:", error);
//     res.status(500).json({ error: "Internal server error." });
//   }
// });

/**
 * Verify OTP
 */
router.post("/verify-otp", async (req, res) => {
  try {
    const { phoneNumber, otp } = req.body;

    if (!phoneNumber || !otp) {
      return res
        .status(400)
        .json({ error: "Le numéro de téléphone et l'OTP sont requis." });
    }

    // Retrieve user details and OTP
    const userData = userStore[phoneNumber];

    if (!userData) {
      return res.status(400).json({ error: "Invalid or expired OTP." });
    }

    const { otp: storedOtp, expiresAt, name, password } = userData;

    // Validate OTP
    if (otp !== storedOtp.toString()) {
      return res.status(400).json({ error: "OTP invalide." });
    }

    // Check expiration
    if (new Date() > expiresAt) {
      return res.status(400).json({ error: "L'OTP a expiré." });
    }

    // Hash the password before saving it to the database
    const hashedPassword = await bcrypt.hash(password, 10);

    // Mark user as verified
    userData.isVerified = true;

    // Save user to your database
    const { data, error } = await supabase.from("users").insert({
      phone_number: phoneNumber,
      name,
      password: hashedPassword,
      role: "customer",
      is_verified: true,
    });

    if (error) {
      console.error("Erreur lors de l'enregistrement de l'utilisateur:", error);
      return res.status(500).json({ error: "Erreur interne du serveur." });
    }

    // Clean up temporary store
    delete userStore[phoneNumber];

    res.status(200).json({
      message: "OTP vérifié et inscription réussie.",
      user: data,
    });
  } catch (error) {
    console.error("Erreur de vérification de l'OTP:", error);
    res.status(500).json({ error: "Erreur interne du serveur." });
  }
});

export default router;
