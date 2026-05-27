const { createDeliverer } = require("../../utils/auth.js");

async function handler(req, res) {
  if (req.method === "POST") {
    try {
      const delivererData = req.body;
      const newDeliverer = await createDeliverer(delivererData);
      res
        .status(200)
        .json({
          message: "Deliverer created successfully",
          deliverer: newDeliverer,
        });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  } else {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

module.exports = handler;
module.exports.default = handler;
