import bcrypt from "bcrypt";
import { addMinutes } from "date-fns";
import express from "express";
import jwt from "jsonwebtoken";
import { supabase } from "../supabaseClient.js";
import { signIn } from "../utils/auth.js";
import { sendPushNotification } from "../utils/sendNotifications.js";

const userStore = {};

const router = express.Router();

// Temporary in-memory store for OTPs (use Redis or a database in production)
const otpStore = {};

router.post("/signup", async (req, res) => {
  try {
    const { phoneNumber, name, password, role, profilePicture } = req.body;

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
    const expiresAt = addMinutes(new Date(), 10); // OTP expires in 10 minutes

    // Hash password before storing
    const hashedPassword = await bcrypt.hash(password, 10);

    // Delete any previous OTPs for this number to avoid conflicts
    await supabase.from("otps").delete().eq("phone_number", phoneNumber);

    // Store OTP + user details in DB (no in-memory store — survives server restarts)
    await supabase
      .from("otps")
      .insert({
        phone_number: phoneNumber,
        otp,
        expires_at: expiresAt,
        user_name: name,
        user_password: hashedPassword,
        user_role: "customer",
        profile_picture: profilePicture ?? null,
      });

    // Return OTP for testing (remove in production)
    res.status(200).json({
      message: "OTP généré avec succès.",
      otp, // For testing purposes only; remove in production
    });
  } catch (error) {

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

    const { user } = await signIn(phoneNumber, password);
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: "60d",
    });

    let delivererInfo = null;

    if (user.role === 'deliverer') {
      const { data: delivererData, error: delivererError } = await supabase
        .from('deliverers')
        .select('*')
        .eq('user_id', user.id)
        .single();
      
      if (!delivererError && delivererData) {
        delivererInfo = {
          id: delivererData.id,
          userId: delivererData.user_id,
          vehicleId: delivererData.vehicle_id,
          isAvailable: delivererData.is_available,
          currentLocation: delivererData.current_location,
          zone: delivererData.zone,
          isActive: delivererData.is_active,
          isVerified: delivererData.is_verified
        };
      }
    }

    res.status(200).json({
      message: "Connexion réussie.",
      user: {
        id: user.id,
        name: user.name,
        phoneNumber: phoneNumber,
        role: user.role,
        profilePicture: user.profile_picture,
        isVerified: user.is_verified,
      },
      delivererInfo, // Include in response
      token: token,
    });
  } catch (error) {

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

    // Retrieve OTP record from DB (no more in-memory store)
    const { data: otpRecord, error: otpError } = await supabase
      .from("otps")
      .select("*")
      .eq("phone_number", phoneNumber)
      .eq("otp", otp)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (otpError || !otpRecord) {
      return res.status(400).json({ error: "Code OTP invalide ou introuvable." });
    }

    // Check expiration
    if (new Date() > new Date(otpRecord.expires_at)) {
      return res.status(400).json({ error: "L'OTP a expiré. Veuillez en demander un nouveau." });
    }

    // Save user to database (password already hashed during signup)
    const { data, error } = await supabase.from("users").insert({
      phone_number: phoneNumber,
      name: otpRecord.user_name,
      password: otpRecord.user_password,
      role: otpRecord.user_role ?? "customer",
      is_verified: true,
      profile_picture: otpRecord.profile_picture ?? null,
    });

    if (error) {
      return res.status(500).json({ error: "Erreur interne du serveur." });
    }

    // Clean up used OTP from DB
    await supabase.from("otps").delete().eq("id", otpRecord.id);

    res.status(200).json({
      message: "OTP vérifié et inscription réussie.",
      user: data,
    });
  } catch (error) {
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

    // 2. Delete any previous OTPs for this number (avoids stale records being matched)
    await supabase.from("otps").delete().eq("phone_number", phoneNumber);

    // 3. Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000); // 6-digit
    const expiresAt = addMinutes(new Date(), 10); // 10 mins — explicit UTC ISO string

    // 4. Store OTP with explicit UTC timestamp to avoid timezone issues
    const { error: insertError } = await supabase.from("otps").insert({
      phone_number: phoneNumber,
      otp,
      expires_at: expiresAt.toISOString(),
    });

    if (insertError) {
      return res.status(500).json({ error: "Erreur lors de la création de l'OTP." });
    }

    const bodyMessage = `Votre code OTP est : ${otp}`;

    // 5. Insert notification
    await supabase.from("notifications").insert({
      user_id: user.id,
      title: "Code de réinitialisation",
      body: bodyMessage,
    });

    // 6. Send push notification via Expo
    await sendPushNotification(user.id, "Code de réinitialisation", bodyMessage, {}, supabase);

    // 7. Return response (remove otp in production)
    return res.status(200).json({
      message: "Code OTP envoyé avec succès.",
      otp, // ⚠️ Remove in production
    });
  } catch (error) {
    return res.status(500).json({ error: "Erreur interne du serveur." });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { phoneNumber, otp, newPassword } = req.body;

    if (!phoneNumber || !otp || !newPassword) {
      return res.status(400).json({ error: "Tous les champs sont requis." });
    }

    // Cast otp to number (DB stores it as integer, req.body may send a string)
    const otpNumber = Number(otp);
    if (isNaN(otpNumber)) {
      return res.status(400).json({ error: "Code OTP invalide." });
    }

    // Find the OTP record — filter expired ones on the DB side using server time
    const now = new Date().toISOString();
    const { data: otpRecord, error } = await supabase
      .from("otps")
      .select("*")
      .eq("phone_number", phoneNumber)
      .eq("otp", otpNumber)
      .gt("expires_at", now)   // ← DB-side expiry check: only return non-expired rows
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !otpRecord) {
      // Could be invalid OTP OR already expired — give a clear user message
      return res.status(400).json({
        error: "Code OTP invalide ou expiré. Veuillez en demander un nouveau.",
      });
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

    // Delete used OTP
    await supabase.from("otps").delete().eq("id", otpRecord.id);

    return res.status(200).json({ message: "Mot de passe réinitialisé avec succès." });
  } catch (error) {
    return res.status(500).json({ error: "Erreur interne du serveur." });
  }
});

export default router;
