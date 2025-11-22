// src/routes/payoutStatus.js
import express from "express";
import { supabase } from "../supabaseClient.js";

const router = express.Router();

/**
 * Récupérer le statut des payouts pour une commande
 */
router.get("/payout/status/order/:orderId", async (req, res) => {
  const { orderId } = req.params;

  try {
    const { data, error } = await supabase
      .from("payout_batch_items")
      .select(
        "batch_id, payout_id, target_type, target_id, receive_amount, fee, status, error_code, error_message, created_at"
      )
      .eq("order_id", orderId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      return res
        .status(500)
        .json({ message: "Erreur lors de la récupération des payouts." });
    }

    return res.json({ orderId, payouts: data });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ message: "Erreur interne du serveur (payouts)." });
  }
});
router.get("/payout/status/batch/:batchId", async (req, res) => {
  const { batchId } = req.params;

  try {
    const { data, error } = await supabase
      .from("payout_batch_items")
      .select(
        "order_id, payout_id, target_type, target_id, receive_amount, fee, status, error_code, error_message, created_at"
      )
      .eq("batch_id", batchId);

    if (error) {
      console.error(error);
      return res
        .status(500)
        .json({ message: "Erreur lors de la récupération du batch." });
    }

    return res.json({ batchId, payouts: data });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ message: "Erreur interne du serveur (batch)." });
  }
});
// GET /payout/deliverer/:userId
router.get("/payout/deliverer/:userId", async (req, res) => {
  const { userId } = req.params;

  const { data, error } = await supabase
    .from("payout_batch_items")
    .select("*")
    .eq("target_type", "deliverer")
    .eq("target_id", userId)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ message: "Erreur chargement payouts." });

  return res.json({ items: data });
});




export default router;
