// src/routes/wavePayments.ts
import express from 'express';
import { supabase } from '../supabaseClient.js'; // adapte le chemin
import { sendWavePayoutToRestaurant } from '../wavePayoutService.js';

const router = express.Router();

/**
 * SUCCESS URL CALLED BY WAVE (or redirected browser)
 * GET /payment/wave/success?orderId=...
 */
router.get('/payment/wave/success', async (req, res) => {
  const { orderId } = req.query;

  if (!orderId || typeof orderId !== 'string') {
    return res.status(400).send('Missing orderId');
  }

  try {
    // 1. Marquer la commande comme payée
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .update({
        is_paid: true,
        payment_method: 'WAVE',
      })
      .eq('id', orderId)
      .select()
      .single();

    if (orderErr || !order) {
      console.error('Error updating order as paid:', orderErr);
      return res.status(500).send('Failed to update order');
    }

    // 2. Optionnel : déclencher le payout automatique vers le restaurant
    try {
      await sendWavePayoutToRestaurant(order.id);
    } catch (payoutErr) {
      console.error('Wave payout error (restaurant):', payoutErr);
      // Tu peux décider de ne PAS renvoyer une erreur au client ici
      // car le paiement client est déjà fait; le payout peut être re-essayé plus tard.
    }

    // 3. Rediriger l’utilisateur vers ton app mobile / web
    res.redirect(`gourmetdamour://customer/UserOrdersScreen`);

    return res.send('Payment success. You can close this page.');
  } catch (err) {
    console.error('Wave success handler error:', err);
    return res.status(500).send('Internal server error');
  }
});

// toujours dans wavePayments.ts

router.get('/payment/wave/error', async (req, res) => {
  const { orderId } = req.query;

  // Tu peux logger, annuler la commande, etc.
  if (orderId && typeof orderId === 'string') {
    await supabase
      .from('orders')
      .update({
        is_paid: false,
      })
      .eq('id', orderId);
  }

  // Redirection vers l’app ou message simple
  // res.redirect(`gourmetdamour://payment-error?orderId=${orderId}`);
  return res.send('Payment failed or cancelled. You can close this page.');
});


export default router;
