import bcrypt from "bcrypt";
import { addMinutes } from "date-fns";
import express from "express";
import jwt from "jsonwebtoken";
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
    const checkQuery = 'SELECT phone_number FROM users WHERE phone_number = $1';
    const { rows: existingUser } = await pool.query(checkQuery, [phoneNumber]);

    if (existingUser.length > 0) {
      return res.status(400).json({ error: "Ce numéro est déjà utilisé." });
    }

    // If the role is "deliverer", skip OTP and save directly to the database
    if (role === "deliverer") {
      // Hash the password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Save user to the database
      const insertUserQuery = `
        INSERT INTO users (phone_number, name, password, role, is_verified)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *;
      `;
      const userValues = [phoneNumber, name, hashedPassword, "deliverer", true];
      const { rows: userDataRows } = await pool.query(insertUserQuery, userValues);
      const userData = userDataRows[0];

      // Insert deliverer-specific information into the `deliverers` table
      const insertDelivererQuery = `
        INSERT INTO deliverers (user_id, vehicle_id, is_available, current_location, zone, profile_picture)
        VALUES ($1, $2, $3, $4, $5, $6);
      `;
      const delivererValues = [userData.id, null, true, null, null, null];
      await pool.query(insertDelivererQuery, delivererValues);

      return res.status(201).json({
        message: "Livreur ajouté avec succès.",
        user: userData,
      });
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
    const insertOtpQuery = `
      INSERT INTO otps (phone_number, otp, expires_at)
      VALUES ($1, $2, $3);
    `;
    await pool.query(insertOtpQuery, [phoneNumber, otp, expiresAt]);

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
    const insertUserQuery = `
      INSERT INTO users (phone_number, name, password, role, is_verified)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const userValues = [phoneNumber, name, hashedPassword, "customer", true];
    const { rows: userRows } = await pool.query(insertUserQuery, userValues);
    const data = userRows[0];

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
