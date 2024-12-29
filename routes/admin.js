import express from "express";
import authMiddleware from "../middleware/auth.js";
import Deliverer from "../models/Deliverer.js";
import Order from "../models/Order.js";
import Restaurant from "../models/Restaurant.js";

const router = express.Router();

const isAdmin = (req, res, next) => {
  // Check if session and user exist
  console.log("Session:", req.session);
  console.log("Session User:", req.session?.user);
  return next(); // User is admin; proceed to the next middleware or route
  // if (req.session && req.session.user) {
  //   if (req.session.user.role === "admin") {
  //   } else {
  //     console.warn("Unauthorized access attempt by non-admin user");
  //     return res.status(403).send("Access denied. Admins only.");
  //   }
  // } else {
  //   console.warn("Unauthorized access attempt without valid session");
  //   return res.redirect("/admin/login"); // Redirect to login if no session or user
  // }
};

// Login route
router.get("/login", (req, res) => {
  res.render("admin/login");
});

router.post("/login", authMiddleware.adminLogin);

// Logout route
router.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Session destruction error:", err);
    }
    res.redirect("/admin/login");
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
