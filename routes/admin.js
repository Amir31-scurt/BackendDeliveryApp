import bcrypt from "bcrypt";
import express from "express";
import jwt from "jsonwebtoken";
import Order from "../models/Order.js";
import Restaurant from "../models/Restaurant.js";
import { default as Deliverer } from "../models/User.js";
import { supabase } from "../supabaseClient.js";

const router = express.Router();

const isAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ error: "Unauthorized access." });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { data: adminUser, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", decoded.id)
      .single();

    if (error || !adminUser || adminUser.role !== "admin") {
      return res.status(403).json({ error: "Access denied. Admins only." });
    }

    req.user = adminUser; // Attach admin user to request
    next();
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(403).json({ error: "Invalid or expired token." });
  }
};

// Admin login route
router.post("/login", async (req, res) => {
  const { phoneNumber, password } = req.body;

  if (!phoneNumber || !password) {
    return res
      .status(400)
      .json({ error: "Phone number and password are required." });
  }

  try {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("phone_number", phoneNumber)
      .eq("role", "admin");

    if (error) {
      console.error(error);
      return res.status(404).json({ error: "Admin not found." });
    }

    // Handle no matching user
    if (!data) {
      return res.status(404).json({ error: "Admin not found." });
    }

    const user = data;

    // Log retrieved user data
    console.log("Retrieved User:", user[0]);

    const isValidPassword = await bcrypt.compare(password, user[0].password);
    if (!isValidPassword) {
      return res.status(400).json({ error: "Invalid credentials." });
    }

    // Generate JWT token
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    res.status(200).json({
      message: "Login successful.",
      token,
      user: user[0],
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "An error occurred during login." });
  }
});

router.get("/login", (req, res) => {
  res.render("admin/login");
});

// Admin logout route
router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Session destruction error:", err);
      return res.status(500).json({ error: "Failed to logout." });
    }
    res.status(200).json({ message: "Logout successful." });
  });
});

// Dashboard route
router.get("/", isAdmin, async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments();
    const activeRestaurants = await Restaurant.countDocuments({
      isActive: true,
    });
    const activeDeliverers = await Deliverer.countDocuments({
      isAvailable: true,
    });
    const totalRevenue = await Order.aggregate([
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]);

    const monthlyOrders = await Order.aggregate([
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 6 },
      { $project: { month: "$_id", orders: "$count", _id: 0 } },
    ]);

    res.render("admin/dashboard", {
      layout: "admin/layout",
      title: "Dashboard",
      totalOrders,
      activeRestaurants,
      activeDeliverers,
      totalRevenue: totalRevenue[0]?.total || 0,
      monthlyOrders,
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).send("An error occurred");
  }
});

// Restaurants route
router.get("/restaurants", isAdmin, async (req, res) => {
  try {
    const restaurants = await Restaurant.find();
    res.render("admin/restaurants", { restaurants });
  } catch (error) {
    console.error("Restaurants error:", error);
    res.status(500).send("An error occurred");
  }
});

router.post("/restaurants/add", async (req, res) => {
  try {
    console.log("Request Body:", req.body); // Log the incoming data
    const {
      name,
      description,
      address,
      type,
      phoneNumber,
      email,
      imageUrl,
      isActive,
      openingHours,
    } = req.body;

    // Create a new restaurant object
    const newRestaurant = new Restaurant({
      name,
      description,
      address,
      type,
      phoneNumber,
      email,
      imageUrl,
      isActive: isActive === "true", // Convert string to boolean
      openingHours,
    });

    // Save the new restaurant to the database
    await newRestaurant.save();

    // Redirect back to the restaurants page
    res.redirect("/admin/restaurants");
  } catch (error) {
    console.error("Error adding restaurant:", error);
    res.status(500).send("An error occurred while adding the restaurant.");
  }
});

// Add more routes for other admin functionalities (e.g., orders, deliverers)

export default router;
