const { signUp } = require("../../utils/auth.js");

async function handler(req, res) {
  if (req.method === "POST") {
    try {
      const { phoneNumber, password, name, role } = req.body;
      const userData = await signUp(phoneNumber, password, name);

      // if (role === 'deliverer') {
      //   // Additional logic for creating a deliverer
      //   // This would typically involve creating a record in the deliverers table
      //   // You might want to handle this in a separate API route
      // }

      res
        .status(200)
        .json({ message: "User registered successfully", user: userData });
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
