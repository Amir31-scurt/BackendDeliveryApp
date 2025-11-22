import fetch from "node-fetch";
import { supabase } from "../supabaseClient.js";
import { randomUUID } from "crypto";
import { translateWaveError } from "../utils/waveErrorMap.js";
import { logBatchResults } from "./waveBatchLogger.js";

const WAVE_BATCH_URL = "https://api.wave.com/v1/payout-batch";
const API_KEY = process.env.WAVE_API_KEY;

/**
 * Crée un payout batch pour restaurant + livreur
 */
export async function sendBatchPayout(orderId) {
  // 1. Charger la commande
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select(`
      id,
      restaurant_id,
      deliverer_id,
      restaurant_payout,
      deliverer_payout,
      currency
    `)
    .eq("id", orderId)
    .single();

  if (orderErr || !order) {
    throw new Error("Impossible de charger la commande.");
  }

  // 2. Charger le restaurant
  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id, name, phone_number")
    .eq("id", order.restaurant_id)
    .single();

  if (!restaurant?.phone_number) {
    throw new Error("Le restaurant n'a pas enregistré de numéro Wave.");
  }

  // 3. Charger le livreur (si payout > 0)
  if (order.deliverer_payout > 0) {
    const { data: delivererUser } = await supabase
    .from("users")
    .select("id, name, phone_number")
    .eq("id", order.deliverer_id)
    .single();

    if (!delivererUser?.phone_number) {
    throw new Error("Le livreur n'a pas de numéro Wave enregistré.");
    }
  }

  // 4. Construire le batch
  const batch = [
    {
      currency: "XOF",
      receive_amount: String(order.restaurant_payout),
      mobile: restaurant.phone_number,
      name: restaurant.name
    }
  ];

  if (order.deliverer_payout > 0) {
    batch.push({
        currency: "XOF",
        receive_amount: String(order.deliverer_payout),
        mobile: delivererUser.phone_number,
        name: delivererUser.name || "Livreur"
    });
  }

  // 5. Envoyer vers Wave
  const idempotencyKey = randomUUID();

  const res = await fetch(WAVE_BATCH_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey
    },
    body: JSON.stringify({ payouts: batch })
  });

  const text = await res.text();
  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Réponse invalide de Wave.");
  }

  // 6. Log interne détaillé
  await logBatchResults(orderId, data);

  return data;
}
