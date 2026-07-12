const bcrypt = require("bcrypt");
const { addMinutes } = require("date-fns");
const express = require("express");
const jwt = require("jsonwebtoken");
const { supabase } = require("../supabaseClient.js");
const { query } = require("../db.js");
const { signIn } = require("../utils/auth.js");
const { sendPushNotification } = require("../utils/sendNotifications.js");

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
    const { data: users, error: existingUserError } = await query(
      "SELECT phone_number, is_verified FROM users WHERE phone_number = $1 LIMIT 1",
      [phoneNumber]
    );

    if (existingUserError) {
      console.error("[signup] DB check user error:", existingUserError);
      return res.status(500).json({ error: "Erreur interne du serveur." });
    }

    if (users && users.length > 0) {
      const existingUser = users[0];
      if (existingUser.is_verified) {
        return res.status(400).json({ error: "Ce numéro est déjà utilisé." });
      } else {
        // Delete the unverified user to start fresh
        console.log("[signup] Deleting existing unverified user:", phoneNumber);
        await query("DELETE FROM users WHERE phone_number = $1 AND is_verified = false", [phoneNumber]);
      }
    }

    // If the role is "deliverer", skip OTP and save directly to the database
    if (role === "deliverer") {
      // Hash the password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Save user to the database
      const { data: userRows, error: userError } = await query(
        `INSERT INTO users (phone_number, name, password, role, is_verified)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [phoneNumber, name, hashedPassword, "deliverer", true]
      );
      const userData = userRows && userRows.length > 0 ? userRows[0] : null;

      if (userError || !userData) {
        console.error("[signup] DB Insert deliverer user error:", userError);
        return res.status(500).json({ error: "Erreur interne du serveur." });
      }

      // Insert deliverer-specific information into the `deliverers` table
      const { error: delivererError } = await query(
        `INSERT INTO deliverers (user_id, vehicle_id, is_available, current_location, zone)
         VALUES ($1, $2, $3, $4, $5)`,
        [userData.id, null, true, null, null]
      );

      if (delivererError) {
        console.error(
          "Erreur lors de l'enregistrement des informations du livreur:",
          delivererError
        );
        return res
          .status(500)
          .json({ error: "Erreur interne du serveur.", user: userData });
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

    // Save unverified user to users table
    console.log("[signup] Inserting unverified user into PostgreSQL:", { phoneNumber, name });
    const { data: userRows, error: userError } = await query(
      `INSERT INTO users (phone_number, name, password, role, is_verified, profile_picture)
       VALUES ($1, $2, $3, $4::user_type, $5, $6) RETURNING *`,
      [
        phoneNumber,
        name,
        hashedPassword,
        "customer",
        false, // Not verified yet
        profilePicture ?? null
      ]
    );

    if (userError || !userRows || userRows.length === 0) {
      console.error("[signup] DB Insert user error:", userError);
      return res.status(500).json({ error: "Erreur lors de la création de l'utilisateur." });
    }

    // Delete any previous OTPs for this number to avoid conflicts
    await query("DELETE FROM otps WHERE phone_number = $1", [phoneNumber]);

    // Store OTP in DB (no more user details in otps table)
    console.log("[signup] Inserting OTP into PostgreSQL:", { phoneNumber, otp });
    const { error: insertError } = await query(
      `INSERT INTO otps (id, phone_number, otp, expires_at)
       VALUES (gen_random_uuid(), $1, $2, $3)`,
      [
        phoneNumber,
        otp,
        expiresAt
      ]
    );

    if (insertError) {
      console.error("[signup] DB Insert OTP error:", insertError);
      // Clean up the created user if OTP creation fails
      await query("DELETE FROM users WHERE phone_number = $1 AND is_verified = false", [phoneNumber]);
      return res.status(500).json({ error: "Erreur lors de la création de l'OTP." });
    }

    // Return OTP for testing (remove in production)
    res.status(200).json({
      message: "OTP généré avec succès.",
      otp, // For testing purposes only; remove in production
    });
  } catch (error) {
    console.error("[signup] Unexpected error:", error);
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

    if (user.role === "deliverer") {
      const { data: delivererData, error: delivererError } = await supabase
        .from("deliverers")
        .select("*")
        .eq("user_id", user.id)
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
          isVerified: delivererData.is_verified,
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
    res.status(400).json({ error: error.message || "Échec de la connexion." });
  }
});

router.post("/resend-otp", async (req, res) => {
  try {
    const { phoneNumber, name, password, role, profilePicture } = req.body;

    if (!phoneNumber) {
      return res
        .status(400)
        .json({ error: "Le numéro de téléphone est obligatoire." });
    }

    const { data: users, error: existingUserError } = await query(
      "SELECT phone_number, is_verified FROM users WHERE phone_number = $1 LIMIT 1",
      [phoneNumber]
    );

    if (existingUserError) {
      console.error("[resend-otp] DB check user error:", existingUserError);
      return res.status(500).json({ error: "Erreur interne du serveur." });
    }

    const userExists = users && users.length > 0;

    if (userExists) {
      if (users[0].is_verified) {
        return res.status(400).json({ error: "Ce numéro est déjà vérifié." });
      }
    }

    // Si on a fourni les autres infos (cas du Signup), on met à jour ou on recrée l'utilisateur
    if (name && password && role) {
      const hashedPassword = await bcrypt.hash(password, 10);

      if (userExists) {
        console.log("[resend-otp] Updating existing unverified user details:", phoneNumber);
        const { error: updateError } = await query(
          `UPDATE users 
           SET name = $1, password = $2, role = $3::user_type, profile_picture = $4 
           WHERE phone_number = $5 AND is_verified = false`,
          [name, hashedPassword, role || "customer", profilePicture ?? null, phoneNumber]
        );
        
        if (updateError) {
          console.error("[resend-otp] DB Update user error:", updateError);
          return res.status(500).json({ error: "Erreur lors du renvoi de l'OTP." });
        }
      } else {
        console.log("[resend-otp] Re-inserting unverified user:", { phoneNumber, name });
        const { error: userError } = await query(
          `INSERT INTO users (phone_number, name, password, role, is_verified, profile_picture)
           VALUES ($1, $2, $3, $4::user_type, $5, $6)`,
          [phoneNumber, name, hashedPassword, role || "customer", false, profilePicture ?? null]
        );
        
        if (userError) {
          console.error("[resend-otp] DB Insert user error:", userError);
          return res.status(500).json({ error: "Erreur lors du renvoi de l'OTP." });
        }
      }
    } else if (!userExists) {
      // Si on n'a que le numéro, l'utilisateur doit exister
      return res.status(404).json({ error: "Utilisateur introuvable." });
    }

    const otp = Math.floor(100000 + Math.random() * 900000);
    const expiresAt = addMinutes(new Date(), 10);

    await query("DELETE FROM otps WHERE phone_number = $1", [phoneNumber]);

    console.log("[resend-otp] Inserting OTP into PostgreSQL:", { phoneNumber, otp });
    const { error: insertError } = await query(
      `INSERT INTO otps (id, phone_number, otp, expires_at)
       VALUES (gen_random_uuid(), $1, $2, $3)`,
      [
        phoneNumber,
        otp,
        expiresAt
      ]
    );

    if (insertError) {
      console.error("[resend-otp] DB Insert OTP error:", insertError);
      return res.status(500).json({ error: "Erreur lors de la création de l'OTP." });
    }

    res.status(200).json({
      message: "OTP renvoyé avec succès.",
      otp,
    });
  } catch (error) {
    console.error("Erreur lors du renvoi de l'OTP:", error);
    res.status(500).json({ error: "Erreur interne du serveur." });
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

    const otpNumber = Number(otp);
    if (isNaN(otpNumber) || otpNumber === 0) {
      return res.status(400).json({ error: "Code OTP invalide." });
    }

    // Retrieve OTP record from DB (no more in-memory store)
    console.log("[verify-otp] Querying OTP from PostgreSQL:", { phoneNumber, otpNumber });
    const { data: otpRows, error: otpError } = await query(
      "SELECT * FROM otps WHERE phone_number = $1 AND otp = $2 ORDER BY created_at DESC LIMIT 1",
      [phoneNumber, otpNumber]
    );

    if (otpError) {
      console.error("[verify-otp] DB Select Error:", otpError);
      return res.status(500).json({ error: "Erreur lors de la vérification de l'OTP." });
    }

    const otpRecord = otpRows && otpRows.length > 0 ? otpRows[0] : null;

    if (!otpRecord) {
      console.log("[verify-otp] OTP not found for:", { phoneNumber, otpNumber });
      return res.status(400).json({ error: "Code OTP invalide ou introuvable." });
    }

    // Check expiration
    const now = new Date();
    const expiresAt = new Date(otpRecord.expires_at);
    if (now > expiresAt) {
      console.log("[verify-otp] OTP expired:", { now, expiresAt });
      return res
        .status(400)
        .json({ error: "L'OTP a expiré. Veuillez en demander un nouveau." });
    }

    // Verify user (set is_verified = true)
    console.log("[verify-otp] Activating user in PostgreSQL:", { phoneNumber });
    const { data: userRows, error: userError } = await query(
      `UPDATE users 
       SET is_verified = true 
       WHERE phone_number = $1 
       RETURNING *`,
      [phoneNumber]
    );

    if (userError || !userRows || userRows.length === 0) {
      console.error("[verify-otp] DB Update User Error:", userError);
      return res.status(500).json({ error: "Erreur interne du serveur." });
    }

    // Clean up used OTP from DB
    await query("DELETE FROM otps WHERE id = $1", [otpRecord.id]);

    res.status(200).json({
      message: "OTP vérifié et inscription réussie.",
      user: userRows[0],
    });
  } catch (error) {
    console.error("[verify-otp] Unexpected error:", error);
    res.status(500).json({ error: "Erreur interne du serveur." });
  }
});

router.post("/forgot-password", async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res
        .status(400)
        .json({ error: "Le numéro de téléphone est requis." });
    }

    // 1. Check if user exists
    const { data: users, error: userError } = await query(
      "SELECT id, name FROM users WHERE phone_number = $1 LIMIT 1",
      [phoneNumber],
    );

    if (userError || !users || users.length === 0) {
      return res.status(404).json({ error: "Utilisateur introuvable." });
    }
    const user = users[0];

    // 2. Delete any previous OTPs for this number
    await query("DELETE FROM otps WHERE phone_number = $1", [phoneNumber]);

    // 3. Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000);

    // 4. Store OTP — use DB's NOW() so expires_at and the comparison clock are identical
    console.log("[forgot-password] Inserting OTP:", { phoneNumber, otp });
    const { error: insertError } = await query(
      "INSERT INTO otps (id, phone_number, otp, expires_at) VALUES (gen_random_uuid(), $1, $2, NOW() + INTERVAL '10 minutes')",
      [phoneNumber, otp],
    );

    if (insertError) {
      console.error("[forgot-password] Insert OTP error:", insertError);
      return res
        .status(500)
        .json({ error: "Erreur lors de la création de l'OTP." });
    }

    const bodyMessage = `Votre code OTP est : ${otp}`;

    // 5. Insert notification
    await query(
      "INSERT INTO notifications (user_id, title, body) VALUES ($1, $2, $3)",
      [user.id, "Code de réinitialisation", bodyMessage],
    );

    // 6. Send push notification (may silently fail if no push token)
    await sendPushNotification(
      user.id,
      "Code de réinitialisation",
      bodyMessage,
      {},
      supabase,
    );

    // 7. Return OTP in response (remove in production)
    return res.status(200).json({
      message: "Code OTP envoyé avec succès.",
      otp, // ⚠️ Remove in production
    });
  } catch (error) {
    console.error("[forgot-password] Unexpected error:", error);
    return res.status(500).json({ error: "Erreur interne du serveur." });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { phoneNumber, otp, newPassword } = req.body;

    if (!phoneNumber || !otp || !newPassword) {
      return res.status(400).json({ error: "Tous les champs sont requis." });
    }

    const otpNumber = Number(otp);
    if (isNaN(otpNumber) || otpNumber === 0) {
      return res.status(400).json({ error: "Code OTP invalide." });
    }

    // Find valid non-expired OTP — uses DB's NOW() so timezone is always consistent
    console.log("[reset-password] Searching OTP:", { phoneNumber, otpNumber });
    const { data: otpRows, error: otpError } = await query(
      "SELECT * FROM otps WHERE phone_number = $1 AND otp = $2 AND expires_at > NOW() LIMIT 1",
      [phoneNumber, otpNumber],
    );

    console.log("[reset-password] OTP query result:", { otpRows, otpError });

    if (otpError) {
      console.error("[reset-password] DB error:", otpError);
      return res
        .status(500)
        .json({ error: "Erreur lors de la vérification de l'OTP." });
    }

    if (!otpRows || otpRows.length === 0) {
      return res.status(400).json({
        error: "Code OTP invalide ou expiré. Veuillez en demander un nouveau.",
      });
    }

    const otpRecord = otpRows[0];

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user password
    const { error: updateError } = await query(
      "UPDATE users SET password = $1 WHERE phone_number = $2",
      [hashedPassword, phoneNumber],
    );

    if (updateError) {
      console.error("[reset-password] Update error:", updateError);
      return res
        .status(500)
        .json({ error: "Erreur lors de la mise à jour du mot de passe." });
    }

    // Delete used OTP
    await query("DELETE FROM otps WHERE id = $1", [otpRecord.id]);

    return res
      .status(200)
      .json({ message: "Mot de passe réinitialisé avec succès." });
  } catch (error) {
    console.error("[reset-password] Unexpected error:", error);
    return res.status(500).json({ error: "Erreur interne du serveur." });
  }
});

module.exports = router;
module.exports.default = router;
