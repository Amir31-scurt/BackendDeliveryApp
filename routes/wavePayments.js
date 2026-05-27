// src/routes/wavePayments.ts
const express = require("express");
const { supabase } = require("../supabaseClient.js"); // adapte le chemin
const { sendWavePayoutToRestaurant } = require("../wavePayoutService.js");

const router = express.Router();

/**
 * SUCCESS URL CALLED BY WAVE (or redirected browser)
 * GET /payment/wave/success?orderId=...
 */
router.get("/payment/wave/success", async (req, res) => {
  const {orderId} = req.query;

  if (!orderId || typeof orderId !== "string") {
    return res.status(400).send("Missing orderId");
  }

  try {
    // Find the order by ID
    const {data: order, error: orderErr} = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (orderErr || !order) {
      return res.status(500).send("Failed to find order");
    }

    // 1. Mark the order as paid
    const {data: updatedOrder, error: updateErr} = await supabase
      .from("orders")
      .update({
        is_paid: true,
        payment_method: "WAVE",
      })
      .eq("id", order.id)
      .select()
      .single();

    if (updateErr || !updatedOrder) {
      return res.status(500).send("Failed to update order");
    }

    // 1.5. Ensure revenue distribution is calculated (should already be done on order creation)
    // But let's call it again just to be safe
    const {data: computed, error: computeErr} = await supabase.rpc(
      "compute_order_from_total",
      {p_order_id: updatedOrder.id},
    );

    if (computeErr) {
      // Don't fail the request, just log it
    }

    // 2. Optional: trigger automatic payout to restaurant
    try {
      await sendWavePayoutToRestaurant(updatedOrder.id);
    } catch (payoutErr) {
      // Don't fail - payout can be retried later
    }

    // 3. Redirect user back to app
    res.redirect(`gourmetdamour://customer/UserOrdersScreen`);

    return res.send("Payement effectué. Vous pouvez fermer cette page.");
  } catch (err) {
    return res.status(500).send("Internal server error");
  }
});

// toujours dans wavePayments.ts

router.get("/payment/wave/error", async (req, res) => {
  const {orderId} = req.query;

  // Tu peux logger, annuler la commande, etc.
  if (orderId && typeof orderId === "string") {
    await supabase
      .from("orders")
      .update({
        is_paid: false,
      })
      .eq("id", orderId);
  }

  // Redirection vers l’app ou message simple
  // res.redirect(`gourmetdamour://payment-error?orderId=${orderId}`);
  return res.send("Payment failed or cancelled. You can close this page.");
});

module.exports = router;
module.exports.default = router;
