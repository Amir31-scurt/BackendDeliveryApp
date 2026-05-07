import { Expo } from 'expo-server-sdk';

const expo = new Expo();

export async function sendPushNotification(userId, title, messageText, data = {}, supabase) {
  // 1. Get the user's saved push token from Supabase
  const { data: tokens, error } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('user_id', userId);

  if (error || !tokens || tokens.length === 0) {

    return;
  }

  // 2. Create the message(s)
  const messages = tokens.map(({ token }) => ({
    to: token,                     // Expo push token
    sound: 'default',
    title: title,                  // Dynamic title based on notification type
    body: messageText,            // e.g. "Votre commande est maintenant prête"
    data: data,                   // Include custom data for redirection (screen, orderId)
  }));

  // 3. Send messages using Expo SDK
  const chunks = expo.chunkPushNotifications(messages);

  for (const chunk of chunks) {
    try {
      const receipts = await expo.sendPushNotificationsAsync(chunk);
      
    } catch (err) {

    }
  }
}
