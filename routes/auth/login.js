import { signIn } from "../../utils/auth";

export default async function handler(req, res) {
  if (req.method === "POST") {
    try {
      const { phoneNumber, password } = req.body;
      const { user, session } = await signIn(phoneNumber, password);

      res.status(200).json({
        message: "Login successful",
        user: {
          id: user.id,
          phoneNumber: user.phone,
          role: user.user_metadata.role,
        },
        token: session.access_token,
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  } else {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
