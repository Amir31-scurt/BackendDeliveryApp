import express from "express";
import {
  createDeliverer,
  getDelivererProfile,
  updateDelivererProfile,
} from "../utils/deliverers.js";

const router = express.Router();

router.post("/create", async (req, res) => {
  try {
    const delivererData = req.body;
    const newDeliverer = await createDeliverer(delivererData);
    res.status(200).json({
      message: "Deliverer created successfully",
      deliverer: newDeliverer,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get("/profile/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const profile = await getDelivererProfile(id);
    res.status(200).json(profile);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put("/profile/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const updatedProfile = await updateDelivererProfile(id, updates);
    res.status(200).json({
      message: "Profile updated successfully",
      profile: updatedProfile,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
