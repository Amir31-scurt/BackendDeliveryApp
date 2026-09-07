// src/routes/wavePayments.js
const express = require("express");
const crypto = require("crypto");
const { supabase } = require("../supabaseClient.js");
const { sendWavePayoutToRestaurant } = require("../wavePayoutService.js");

const router = express.Router();

/**
 * Log transaction in payment_transactions table
 */
async function logPaymentTransaction({
  orderId,
  provider = "WAVE",
  transactionId = null,
  amount = null,
  currency = "XOF",
  status,
  rawResponse = null,
}) {
  try {
    await supabase.from("payment_transactions").insert([
      {
        order_id: orderId,
        provider: provider,
        transaction_id: transactionId,
        amount: amount,
        currency: currency,
        status: status, // 'SUCCESS', 'FAILED', 'CANCELLED', 'PENDING'
        raw_response: rawResponse ? JSON.stringify(rawResponse) : null,
      },
    ]);
  } catch (err) {
    // Non-blocking log if table does not exist yet
    console.warn("[payment_transactions] Log warning:", err.message);
  }
}

/**
 * SUCCESS URL CALLED BY WAVE (or redirected browser)
 * GET /payment/wave/success?orderId=...
 */
router.get("/payment/wave/success", async (req, res) => {
  const { orderId } = req.query;

  if (!orderId || typeof orderId !== "string") {
    return res.status(400).send("Missing orderId");
  }

  try {
    // Find the order by ID
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (orderErr || !order) {
      return res.status(500).send("Failed to find order");
    }

    // 1. Mark the order as paid
    const { data: updatedOrder, error: updateErr } = await supabase
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

    // 2. Ensure revenue distribution is calculated
    try {
      await supabase.rpc("compute_order_from_total", {
        p_order_id: updatedOrder.id,
      });
    } catch (computeErr) {
      // Non-blocking
    }

    // 3. Optional: trigger automatic payout to restaurant
    try {
      await sendWavePayoutToRestaurant(updatedOrder.id);
    } catch (payoutErr) {
      // Don't fail - payout can be retried later
    }

    // 4. Log the transaction
    await logPaymentTransaction({
      orderId: updatedOrder.id,
      provider: "WAVE",
      amount: updatedOrder.total_amount,
      currency: "XOF",
      status: "SUCCESS",
      rawResponse: { source: "redirect_return_url", query: req.query },
    });

    // 5. Render success page (page handles deep-link redirect)
    return res.render("payment-success", { orderId: updatedOrder.id });
  } catch (err) {
    return res.status(500).render("payment-error", { orderId: orderId || null });
  }
});

/**
 * ERROR / CANCEL URL CALLED BY WAVE (or redirected browser)
 * GET /payment/wave/error?orderId=...
 */
router.get("/payment/wave/error", async (req, res) => {
  const { orderId } = req.query;

  // Mark order as unpaid / cancelled
  if (orderId && typeof orderId === "string") {
    await supabase
      .from("orders")
      .update({ is_paid: false })
      .eq("id", orderId);

    // Log the failed / cancelled transaction
    await logPaymentTransaction({
      orderId: orderId,
      provider: "WAVE",
      status: "FAILED",
      rawResponse: { source: "redirect_error_url", query: req.query },
    });
  }

  // Render error page (page handles deep-link redirect)
  return res.render("payment-error", { orderId: orderId || null });
});

/**
 * ASYNCHRONOUS SERVER-TO-SERVER WEBHOOK CALLED BY WAVE
 * POST /payment/wave/webhook
 */
router.post("/payment/wave/webhook", async (req, res) => {
  const waveSignature = req.headers["wave-signature"];
  const webhookSecret = process.env.WAVE_WEBHOOK_SECRET;

  // Verify HMAC signature if webhook secret is configured
  if (webhookSecret && waveSignature) {
    try {
      const payloadString = JSON.stringify(req.body);
      const computedSig = crypto
        .createHmac("sha256", webhookSecret)
        .update(payloadString)
        .digest("hex");

      if (!waveSignature.includes(computedSig)) {
        console.warn("[wave-webhook] Signature mismatch warning");
      }
    } catch (sigErr) {
      console.warn("[wave-webhook] Signature verification error:", sigErr.message);
    }
  }

  const event = req.body || {};
  const eventType = event.type;
  const sessionData = event.data || {};

  // Extract orderId from client_reference or metadata
  const orderId =
    sessionData.client_reference ||
    sessionData.metadata?.order_id ||
    sessionData.metadata?.orderId ||
    req.query.orderId;

  console.log(`[wave-webhook] Received event: ${eventType} for order: ${orderId}`);

  if (!orderId) {
    return res.status(200).json({ received: true, note: "No orderId found in event" });
  }

  try {
    if (eventType === "checkout.session.completed") {
      const transactionId = sessionData.transaction_id || sessionData.id;
      const amount = sessionData.amount ? parseFloat(sessionData.amount) : null;
      const currency = sessionData.currency || "XOF";

      // 1. Mark order as paid
      const { data: updatedOrder, error: updateErr } = await supabase
        .from("orders")
        .update({
          is_paid: true,
          payment_method: "WAVE",
        })
        .eq("id", orderId)
        .select()
        .single();

      if (!updateErr && updatedOrder) {
        // 2. Compute revenue distribution
        try {
          await supabase.rpc("compute_order_from_total", {
            p_order_id: updatedOrder.id,
          });
        } catch (_) {}

        // 3. Send payout to restaurant
        try {
          await sendWavePayoutToRestaurant(updatedOrder.id);
        } catch (_) {}
      }

      // 4. Trace transaction in database
      await logPaymentTransaction({
        orderId: orderId,
        provider: "WAVE",
        transactionId: transactionId,
        amount: amount,
        currency: currency,
        status: "SUCCESS",
        rawResponse: event,
      });

    } else if (
      eventType === "checkout.session.cancelled" ||
      eventType === "checkout.session.expired"
    ) {
      await supabase
        .from("orders")
        .update({ is_paid: false })
        .eq("id", orderId);

      await logPaymentTransaction({
        orderId: orderId,
        provider: "WAVE",
        transactionId: sessionData.transaction_id || sessionData.id,
        amount: sessionData.amount ? parseFloat(sessionData.amount) : null,
        currency: sessionData.currency || "XOF",
        status: "CANCELLED",
        rawResponse: event,
      });
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("[wave-webhook] Error processing event:", err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.default = router;
