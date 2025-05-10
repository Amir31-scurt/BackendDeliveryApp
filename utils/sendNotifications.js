import { Expo } from 'expo-server-sdk';

const expo = new Expo();

export async function sendPushNotification(userId, messageText, supabase) {
  // 1. Get the user's saved push token from Supabase
  const { data: tokens, error } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('user_id', userId);

  if (error || !tokens || tokens.length === 0) {
    console.warn('No push token found for user');
    return;
  }

  // 2. Create the message(s)
  const messages = tokens.map(({ token }) => ({
    to: token,                     // Expo push token
    sound: 'default',
    title: 'Mise à jour de la commande',
    body: messageText,            // e.g. "Your order is now ready"
  }));

  // 3. Send messages using Expo SDK
  const chunks = expo.chunkPushNotifications(messages);

  for (const chunk of chunks) {
    try {
      const receipts = await expo.sendPushNotificationsAsync(chunk);
      console.log('Sent:', receipts);
    } catch (err) {
      console.error('Error sending push:', err);
    }
  }
}
