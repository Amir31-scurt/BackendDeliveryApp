import express from "express";
import { signIn, signUp } from "../utils/auth.js";

const router = express.Router();

router.post("/signup", async (req, res) => {
  try {
    const { phoneNumber, password, name, role } = req.body;
    const { user, session } = await signUp(phoneNumber, password, name, role);

    res.status(200).json({
      message: "Signup successful",
      user: {
        id: user.id,
        phoneNumber: user.phone,
        name: user.user_metadata.name,
        role: user.user_metadata.role,
      },
      token: session.access_token,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { phoneNumber, password } = req.body;
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

export default router;
