// src/routes/adminPayouts.js
const express = require("express");
const {supabase} = require("../supabaseClient.js");

const router = express.Router();

/**
 * Liste paginée des payouts batch items
 */
router.get("/admin/payouts", async (req, res) => {
  const {status, target_type, limit = 50, offset = 0} = req.query;

  try {
    let query = supabase
      .from("payout_batch_items")
      .select(
        `
        id,
        batch_id,
        payout_id,
        order_id,
        target_type,
        target_id,
        receive_amount,
        fee,
        status,
        error_code,
        error_message,
        created_at
      `,
        {count: "exact"},
      )
      .order("created_at", {ascending: false})
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (status) query = query.eq("status", status);
    if (target_type) query = query.eq("target_type", target_type);

    const {data, error, count} = await query;

    if (error) {
      return res
        .status(500)
        .json({message: "Erreur lors du chargement des payouts."});
    }

    return res.json({total: count, items: data});
  } catch (err) {
    return res
      .status(500)
      .json({message: "Erreur interne du serveur (admin payouts)."});
  }
});

module.exports = router;
module.exports.default = router;
