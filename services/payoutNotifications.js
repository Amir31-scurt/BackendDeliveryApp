// src/services/payoutNotifications.js
import { supabase } from "../supabaseClient.js";
import { sendPushNotification } from "./pushService.js"; // ton service existant

export async function sendPayoutNotification({ targetType, targetId, amount }) {
  let userId = null;
  let title = "";
  let body = "";

  if (targetType === "restaurant") {
    const { data: restaurant } = await supabase
      .from("restaurants")
      .select("id, owner_id, name")
      .eq("id", targetId)
      .single();

    userId = restaurant?.owner_id;
    title = "Paiement reçu";
    body = `Vous avez reçu un paiement de ${amount} F pour vos commandes.`;
  }

  if (targetType === "deliverer") {
    userId = targetId;
    title = "Paiement de livraison reçu";
    body = `Vous avez reçu un paiement de ${amount} F pour vos livraisons.`;
  }

  if (!userId) return;

  // Enregistrer dans la table notifications
  await supabase.from("notifications").insert([
    {
      user_id: userId,
      title,
      body
    }
  ]);

  // Envoyer une push (si tu as des tokens expo ou FCM)
  try {
    await sendPushNotification(userId, body, supabase);
  } catch (err) {
    console.error("Erreur lors de l'envoi de la notification push :", err);
  }
}
