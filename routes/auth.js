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

    // If the role is "deliverer", skip OTP and save directly to the database
    if (role === "deliverer") {
      // Hash the password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Save user to the database
      const { data: userData, error } = await supabase
        .from("users")
        .insert({
          phone_number: phoneNumber,
          name,
          password: hashedPassword,
          role: "deliverer",
          is_verified: true, // Deliverers are verified by admin
        })
        .select() // Ensures the inserted data is returned
        .single(); // Return a single row

      if (error) {
        console.error("Erreur lors de l'enregistrement du livreur:", error);
        return res.status(500).json({ error: "Erreur interne du serveur." });
      }

      // Insert deliverer-specific information into the `deliverers` table
      const { error: delivererError } = await supabase
        .from("deliverers")
        .insert({
          user_id: userData.id,
          vehicle_id: null, // Default fields for deliverers
          is_available: true,
          current_location: null,
          zone: null,
          profile_picture: null,
        });

      if (delivererError) {
        console.error(
          "Erreur lors de l'enregistrement des informations du livreur:",
          delivererError
        );
        return res
          .status(500)
          .json({ error: "Erreur interne du serveur." + error, user: data });
      }

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
    console.log(req.body);

    if (!phoneNumber || !password) {
      return res.status(400).json({
        error: "Le numéro de téléphone et le mot de passe sont requis.",
      });
    }

    const { user } = await signIn(phoneNumber, password);
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: "60d",
    });

    res.status(200).json({
      message: "Connexion réussie.",
      user: {
        id: user.id,
        name: user.name,
        phoneNumber: phoneNumber,
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

router.post("/forgot-password", async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: "Le numéro de téléphone est requis." });
    }

    // 1. Check if user exists
    const { data: user, error } = await supabase
      .from("users")
      .select("id, name")
      .eq("phone_number", phoneNumber)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: "Utilisateur introuvable." });
    }

    // 2. Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000); // 6-digit
    const expiresAt = addMinutes(new Date(), 5); // 5 mins

    // 3. Store OTP
    await supabase.from("otps").insert({
      phone_number: phoneNumber,
      otp,
      expires_at: expiresAt,
    });

    const bodyMessage = `Votre code OTP est : ${otp}`;

    // 4. Insert notification
    await supabase.from("notifications").insert({
      user_id: user.id,
      title: "Code de réinitialisation",
      body: bodyMessage,
    });

    // 5. Send push notification via Expo
    await sendPushNotification(user.id, bodyMessage, supabase);

    // 6. Return response (you can omit `otp` in production)
    return res.status(200).json({
      message: "Code OTP envoyé avec succès.",
      otp, // ⚠️ Remove in production
    });
  } catch (error) {
    console.error("Erreur dans /forgot-password:", error);
    return res.status(500).json({ error: "Erreur interne du serveur." });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { phoneNumber, otp, newPassword } = req.body;

    if (!phoneNumber || !otp || !newPassword) {
      return res.status(400).json({ error: "Tous les champs sont requis." });
    }

    // Find valid OTP
    const { data: otpRecord, error } = await supabase
      .from("otps")
      .select("*")
      .eq("phone_number", phoneNumber)
      .eq("otp", otp)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !otpRecord) {
      return res.status(400).json({ error: "Code OTP invalide." });
    }

    if (new Date() > new Date(otpRecord.expires_at)) {
      return res.status(400).json({ error: "Code OTP expiré." });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user password
    const { error: updateError } = await supabase
      .from("users")
      .update({ password: hashedPassword })
      .eq("phone_number", phoneNumber);

    if (updateError) {
      return res.status(500).json({ error: "Erreur lors de la mise à jour du mot de passe." });
    }

    // Optionally delete used OTP
    await supabase
      .from("otps")
      .delete()
      .eq("id", otpRecord.id);

    return res.status(200).json({ message: "Mot de passe réinitialisé avec succès." });
  } catch (error) {
    console.error("Erreur dans /reset-password:", error);
    return res.status(500).json({ error: "Erreur interne du serveur." });
  }
});


export default router;
