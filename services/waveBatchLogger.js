const { supabase } = require("../supabaseClient.js");
const { translateWaveError } = require("../utils/waveErrorMap.js");
const { sendPayoutNotification } = require("./payoutNotifications.js");

/**
 * Log les résultats individuels d'un batch Wave
 */
async function logBatchResults(orderId, batchResponse) {
  const batchId = batchResponse.id;
  const payouts = batchResponse.payouts || [];

  for (const p of payouts) {
    const payoutId = p.id;
    const status = p.status;
    const mobile = p.mobile;
    const errorObj = p.payout_error;

    let targetType = null;
    let targetId = null;

    // Détection RESTO ou LIVREUR
    // 1. Restaurant?
    const { data: restaurant } = await supabase
      .from("restaurants")
      .select("id")
      .eq("phone_number", mobile)
      .maybeSingle();

    if (restaurant) {
      targetType = "restaurant";
      targetId = restaurant.id;
    } else {
      // 2. User?
      const { data: user } = await supabase
        .from("users")
        .select("id")
        .eq("phone_number", mobile)
        .maybeSingle();

      if (user) {
        // 3. Vérifier si c'est un livreur
        const { data: deliverer } = await supabase
          .from("deliverers")
          .select("user_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (deliverer) {
          targetType = "deliverer";
          targetId = user.id;
        } else {
          // C'est juste un user normal (peu probable mais propre)
          targetType = "user";
          targetId = user.id;
        }
      }
    }

    // Notifier uniquement en cas de succès
    if (status === "succeeded" && targetType && targetId) {
      await sendPayoutNotification({
        targetType,
        targetId,
        amount: p.receive_amount
      });
    }

    let translatedMsg = errorObj
      ? translateWaveError(errorObj.error_code, errorObj.error_message)
      : null;

    await supabase.from("payout_batch_items").insert([
      {
        batch_id: batchId,
        payout_id: payoutId,
        order_id: orderId,
        target_type: targetType,
        target_id: targetId,
        receive_amount: p.receive_amount,
        fee: p.fee,
        status,
        error_code: errorObj?.error_code || null,
        error_message: translatedMsg,
        wave_payload: p
      }
    ]);
  }
}

module.exports = { logBatchResults };
module.exports.logBatchResults = logBatchResults;
