// src/auth.js
const jwt = require("jsonwebtoken");

const getUserFromToken = (authHeader) => {
    if (!authHeader) return null;

    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return null;

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // decoded: { id, role, phone_number }
        return decoded;
    } catch (err) {
        return null;
    }
};

const signUserToken = (user) => {
    return jwt.sign(
        {
            id: user.id,
            role: user.role,
            phone_number: user.phone_number
        },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
    );
};

module.exports = { getUserFromToken, signUserToken };
