// src/wavePayoutService.js
const {supabase} = require("./supabaseClient.js");
const fetch = require("node-fetch"); // ou global fetch selon ton env

const WAVE_PAYOUT_API_URL =
  process.env.WAVE_PAYOUT_API_URL || "https://api.wave.com/v1/payouts"; // placeholder
const WAVE_API_KEY = process.env.WAVE_API_KEY || "";

/**
 * @typedef {Object} WavePayoutParams
 * @property {number} amount
 * @property {string} currency
 * @property {string} recipient - phone or wallet id
 * @property {string} [description]
 */

/**
 * Call the Wave payout API to send a payout.
 * @param {Object} params
 * @param {number} params.amount
 * @param {string} params.currency
 * @param {string} params.recipient
 * @param {string} [params.description]
 * @returns {Promise<Object>}
 */
async function callWavePayoutAPI(params) {
  const response = await fetch(WAVE_PAYOUT_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WAVE_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      amount: params.amount,
      currency: params.currency,
      recipient: params.recipient,
      description: params.description ?? "Gourmet d’Amour restaurant payout",
      // TODO: adapter au schéma réel de l’API Wave payout
    }),
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON from Wave payout API: ${text}`);
  }

  if (!response.ok) {
    throw new Error(data.message || "Wave payout failed");
  }

  return data;
}

/**
 * 🚀 Payout restaurant pour un ordre donné
 */
async function sendWavePayoutToRestaurant(orderId) {
  // 1. Charger la commande
  const {data: order, error: orderErr} = await supabase
    .from("orders")
    .select("id, restaurant_id, restaurant_payout, currency")
    .eq("id", orderId)
    .single();

  if (orderErr || !order) {
    throw new Error(`Order not found or error loading: ${orderErr?.message}`);
  }

  if (!order.restaurant_payout || order.restaurant_payout <= 0) {
    return;
  }

  // 2. Récupérer le restaurant et son compte Wave
  const {data: restaurant, error: restoErr} = await supabase
    .from("restaurants")
    .select("id, name, phone_number")
    .eq("id", order.restaurant_id)
    .single();

  if (restoErr || !restaurant) {
    throw new Error(
      `Restaurant not found or error loading: ${restoErr?.message}`,
    );
  }

  if (!restaurant.phone_number) {
    throw new Error("Restaurant has no Wave phone/account set");
  }

  // 3. Appeler l’API Wave pour envoyer l’argent
  const payoutResult = await callWavePayoutAPI({
    amount: order.restaurant_payout,
    currency: "XOF",
    recipient: restaurant.phone_number,
    description: `Payout order #${order.id} – ${restaurant.name}`,
  });

  // 4. Optionnel : logguer dans une table "payouts"
  await supabase.from("payouts").insert([
    {
      order_id: order.id,
      restaurant_id: restaurant.id,
      amount: order.restaurant_payout,
      provider: "WAVE",
      provider_reference: payoutResult.id || payoutResult.reference || null,
      status: "SUCCESS",
    },
  ]);

  return payoutResult;
}

module.exports = {sendWavePayoutToRestaurant};
module.exports.sendWavePayoutToRestaurant = sendWavePayoutToRestaurant;
