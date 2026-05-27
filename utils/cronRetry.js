const cron = require("node-cron");
const {supabase} = require("../supabaseClient.js");
const {sendBatchPayout} = require("../waveBatchPayoutService.js");

cron.schedule("*/20 * * * *", async () => {
  const {data: failed} = await supabase
    .from("payout_batch_items")
    .select("order_id")
    .eq("status", "failed");

  const uniqueOrders = [...new Set(failed.map((f) => f.order_id))];

  for (const orderId of uniqueOrders) {
    try {
      await sendBatchPayout(orderId);
    } catch (err) {}
  }
});
