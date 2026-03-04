import { ApolloServer, gql } from "apollo-server-express";
import bcrypt from "bcrypt";
import express from "express";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "path";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { supabase } from "../supabaseClient.js";
import { graphqlRequest } from "../utils/graphqlClient.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import { body, validationResult } from "express-validator";
import { exportToExcel, exportToPdf } from "../utils/exportUtils.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const ROOT_DIR = path.resolve();

// Public routes (no auth required)
router.get("/login", (req, res) => {
  res.render("admin/adminLogin", { layout: false });
});

// Admin login POST route
router.post("/login", [
    body('phoneNumber').notEmpty().withMessage('Le numéro de téléphone est requis'),
    body('password').notEmpty().withMessage('Le mot de passe est requis')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render("admin/adminLogin", {
        errors: errors.array(),
        csrfToken: req.csrfToken(),
        phoneNumber: req.body.phoneNumber,
        layout: false
    });
  }

  try {
    const { phoneNumber, password } = req.body;

    // Find user by phone number
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("phone_number", phoneNumber)
      .single();

    if (userError || !user) {
      return res.render("admin/adminLogin", {
        error: "Numéro de téléphone ou mot de passe incorrect",
        csrfToken: req.csrfToken(),
        phoneNumber,
        layout: false
      });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.render("admin/adminLogin", {
        error: "Numéro de téléphone ou mot de passe incorrect",
        csrfToken: req.csrfToken(),
        phoneNumber,
        layout: false
      });
    }

    // Check if user is an admin
    if (user.role !== "admin") {
      return res.render("admin/adminLogin", {
        error: "Accès refusé. Privilèges administrateur requis.",
        csrfToken: req.csrfToken(),
        phoneNumber,
        layout: false
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    // Set token in cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    // Also populate session for standard MVC (optional if using JWT mainly)
    req.session.user = user;
    req.flash('success_msg', 'Connexion réussie');

    res.redirect("/admin/dashboard");
  } catch (error) {
    console.error("Login error:", error);
    res.render("admin/adminLogin", {
        error: "Erreur interne du serveur",
        csrfToken: req.csrfToken(),
        layout: false
    });
  }
});

// Restaurant login routes (should be public)
router.get("/login/restaurant", (req, res) => {
  res.render("admin/restaurantLogin", { csrfToken: req.csrfToken(), layout: false });
});

router.post("/login/restaurant", async (req, res) => {
  try {
    console.log("Login attempt with body:", req.body);
    const { email } = req.body;

    // --- CSRF token check ---
    const csrfToken = req.body._csrf || req.headers["x-csrf-token"];

    if (!email) {
      console.log("No email provided");
      return res.status(400).json({ error: "Email is required" });
    }

    console.log("Searching for restaurant with email:", email);
    const { data: restaurant, error } = await supabase
      .from("restaurants")
      .select("*")
      .eq("email", email)
      .single();

    if (error) {
      console.error("Database error:", error);
      return res.status(500).json({ error: "Error finding restaurant" });
    }

    if (!restaurant) {
      console.log("Restaurant not found");
      return res.status(404).json({ error: "Restaurant not found" });
    }

    console.log("Restaurant found:", restaurant);

    // --- JWT token creation ---
    const token = jwt.sign(
      { id: restaurant.id, role: "restaurant" },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    console.log("Generated token for restaurant:", restaurant.id);

    // --- Secure cookie setup ---
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    // --- Disable caching ---
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    // --- Response ---
    res.json({
      success: true,
      message: "Login successful",
      token,
      restaurant,
      redirectUrl: `/admin/restaurant/${restaurant.id}/dashboard`,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


// Restaurant dashboard route - moved before the catch-all route
router.get('/restaurant/:id/dashboard', async (req, res) => {
  try {
    // Prevent caching
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    console.log('Dashboard access attempt - ID:', req.params.id);

    // Get token from cookie or Authorization header
    const token = req.cookies.token || req.headers.authorization?.split(" ")[1];
    console.log('Token present:', !!token);

    if (!token) {
      console.log('No token found, redirecting to login');
      return res.redirect('/admin/login/restaurant');
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('Token decoded:', decoded);

      if (decoded.role !== 'restaurant' || decoded.id !== req.params.id) {
        console.log('Invalid token role or ID');
        return res.redirect('/admin/login/restaurant');
      }

      // Fetch restaurant data
      const { data: restaurant, error: restaurantError } = await supabase
        .from('restaurants')
        .select('*')
        .eq('id', req.params.id)
        .single();

      if (restaurantError) {
        console.error('Error fetching restaurant:', restaurantError);
        return res.status(500).send('Error fetching restaurant data');
      }

      if (!restaurant) {
        console.log('Restaurant not found');
        return res.status(404).send('Restaurant not found');
      }

      // Fetch orders for the restaurant
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select(`
          *,
          user:users (
            name,
            phone_number
          ),
          items:order_items (
            quantity,
            price,
            menuItem:menu_items ( name, image_url, description )
          )
        `)
        .eq('restaurant_id', req.params.id)
        .order('created_at', { ascending: false });


      if (ordersError) {
        console.error('Error fetching orders:', ordersError);
        return res.status(500).send('Error fetching orders');
      }

      console.log(orders)

      // Fetch restaurant-level revenue from the view
      const { data: revenueData, error: revenueError } = await supabase
        .from('restaurant_revenue')
        .select('*')
        .eq('restaurant_id', req.params.id)
        .single();

      if (revenueError) {
        console.error('Error fetching restaurant revenue:', revenueError);
      }

      // KPIs
      const totalOrders = orders.length;
      const completedOrders = orders.filter(o => o.status === 'COMPLETED').length;
      const uncompletedOrders = totalOrders - completedOrders;

      // Total revenue from our view (more reliable than summing total_amount)
      const totalRevenue = revenueData?.restaurant_revenue || 0;

      // Today’s revenue
      const todayDate = new Date().toLocaleDateString();
      const todayOrders = orders.filter(
        o => new Date(o.created_at).toLocaleDateString() === todayDate
      );
      const todayRevenue = todayOrders.reduce(
        (sum, o) => sum + (parseFloat(o.products_total) || 0),
        0
      );

      // Optional: Monthly revenue aggregation for the chart
      const { data: monthlyRevenue, error: monthlyError } = await supabase.rpc(
        'get_monthly_restaurant_revenue',  // (we’ll define this next)
        { restaurant_id: req.params.id }
      );

      if (monthlyError) {
        console.error('Error fetching monthly revenue:', monthlyError);
      }

      orders.forEach(order => {

        // 1. Items total
        const itemsTotal = order.items.reduce(
          (sum, item) => sum + (item.price * item.quantity),
          0
        );

        order.items_total = itemsTotal;

        // 2. Real delivery fee = total_amount - items_total - 200
        let deliveryFee = (parseFloat(order.total_amount) || 0) - itemsTotal - 200;
        if (deliveryFee < 0) deliveryFee = 0;

        order.delivery_fee = deliveryFee;

        // 3. Delivery fee minus 200 (your logic)
        let deliveryFeeFinal = deliveryFee - 200;
        if (deliveryFeeFinal < 0) deliveryFeeFinal = 0;

        order.delivery_fee_final = deliveryFeeFinal;

      });



      res.render('restaurant/dashboard', {
        restaurant,
        orders,
        totalOrders,
        completedOrders,
        uncompletedOrders,
        totalRevenue,
        todayRevenue,
        monthlyRevenue: monthlyRevenue || [],
        csrfToken: req.csrfToken()
      });
    } catch (err) {
      console.error('Token verification error:', err);
      return res.redirect('/admin/login/restaurant');
    }
  } catch (error) {
    console.error('Dashboard route error:', error);
    res.status(500).send('Internal server error');
  }
});

// Restaurant menu route
router.get('/restaurant/:id/menu', async (req, res) => {
  try {
    // Prevent caching
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    console.log('Menu access attempt - ID:', req.params.id);

    // Get token from cookie or Authorization header
    const token = req.cookies.token || req.headers.authorization?.split(" ")[1];
    console.log('Token present:', !!token);

    if (!token) {
      console.log('No token found, redirecting to login');
      return res.redirect('/admin/login/restaurant');
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('Token decoded:', decoded);

      if (decoded.role !== 'restaurant' || decoded.id !== req.params.id) {
        console.log('Invalid token role or ID');
        return res.redirect('/admin/login/restaurant');
      }

      // Fetch restaurant data
      const { data: restaurant, error: restaurantError } = await supabase
        .from('restaurants')
        .select('*')
        .eq('id', req.params.id)
        .single();

      if (restaurantError) {
        console.error('Error fetching restaurant:', restaurantError);
        return res.status(500).send('Error fetching restaurant data');
      }

      if (!restaurant) {
        console.log('Restaurant not found');
        return res.status(404).send('Restaurant not found');
      }

      // Fetch menu items for the restaurant
      const { data: menuItems, error: menuError } = await supabase
        .from('menu_items')
        .select('*')
        .eq('restaurant_id', req.params.id)
        .order('created_at', { ascending: false });

      if (menuError) {
        console.error('Error fetching menu items:', menuError);
        return res.status(500).send('Error fetching menu items');
      }

      console.log('Rendering menu with restaurant and menu items data');
      res.render('restaurant/menu', {
        restaurant,
        menuItems: menuItems || [],
        csrfToken: req.csrfToken()
      });
    } catch (err) {
      console.error('Token verification error:', err);
      return res.redirect('/admin/login/restaurant');
    }
  } catch (error) {
    console.error('Menu route error:', error);
    res.status(500).send('Internal server error');
  }
});

router.get("/restaurant/logout", (req, res) => {
  try {
    // Clear cookies
    res.clearCookie("token", { path: "/", httpOnly: true, secure: process.env.NODE_ENV === "production" });
    res.clearCookie("restaurant", { path: "/", httpOnly: true, secure: process.env.NODE_ENV === "production" });
    
    // Invalidate cache
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    // Force client-side cleanup and redirect
    res.send(`
      <html>
        <head>
          <meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate, max-age=0">
          <script>
            localStorage.removeItem('token');
            localStorage.removeItem('restaurant');
            window.location.replace('/admin/login/restaurant');
          </script>
        </head>
        <body>Redirecting...</body>
      </html>
    `);
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).send("Error logging out");
  }
});


// Protected routes (auth required)
router.use(authMiddleware);
router.use(requireRole(['admin']));

// Admin logout route
router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Session destruction error:", err);
      return res.status(500).json({ error: "Failed to logout." });
    }
    res.clearCookie("token");
    res.clearCookie("restaurant");
    res.clearCookie("user");
    res.clearCookie("deliverer");
    localStorage.removeItem("authToken");
    localStorage.removeItem("restaurant");
    localStorage.removeItem("user");
    localStorage.removeItem("deliverer");
    res.status(200).json({ message: "Logout successful." });
  });
});

router.get("/logout", (req, res) => {
  try {
    const role = req.user?.role || req.session?.user?.role;
    
    // Clear the session
    req.session.destroy((err) => {
      if (err) {
        console.error('Error destroying session:', err);
      }
    });

    // Clear the JWT cookies
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });
    
    // Clear other cookies to be safe
    res.clearCookie('restaurant');
    res.clearCookie('user');
    res.clearCookie('deliverer');

    // Redirect based on role
    if (role === 'restaurant') {
      res.redirect('/admin/login/restaurant');
    } else {
      res.redirect('/admin/login');
    }
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error during logout' });
  }
});

// Dashboard route
router.get("/dashboard", async (req, res) => {
  try {
    // Check if it's an AJAX request for data
    if (req.xhr || req.headers.accept.includes('application/json')) {
      // Fetch total restaurants
      const { data: totalRestaurants, error: restaurantError } = await supabase
        .from("restaurants")
        .select("*", { count: "exact" });

      if (restaurantError) {
        console.error("Error fetching restaurant data:", restaurantError);
      }

      // Fetch total active restaurants
      const { data: totalActiveRestaurants, error: activeRestaurantError } =
        await supabase
          .from("restaurants")
          .select("*", { count: "exact" })
          .eq("is_active", true);

      if (activeRestaurantError) {
        console.error("Error fetching restaurant data:", activeRestaurantError);
      }

      // Fetch total deliverers
      const { data: totalDeliverers, error: delivererError } = await supabase
        .from("deliverers")
        .select("*", { count: "exact" });

      if (delivererError) {
        console.error("Error fetching deliverer data:", delivererError);
      }

      // Fetch total orders
      const { data: totalOrders, error: orderError } = await supabase
        .from("orders")
        .select("*", { count: "exact" });

      if (orderError) {
        console.error("Error fetching orders data:", orderError);
      }

      // Fetch monthly orders data
      const { data: monthlyOrders, error: monthlyOrdersError } = await supabase.rpc("get_monthly_orders");

      // New revenue system using v2 functions
      const [
        { data: restoRev, error: restoErr },
        { data: delivererRev, error: delivererErr },
        { data: gourmetRev, error: gourmetErr }
      ] = await Promise.all([
        supabase.rpc('rpc_restaurant_revenue', { p_from: null, p_to: null }),
        supabase.rpc('rpc_deliverer_revenue', { p_from: null, p_to: null }),
        supabase.rpc('rpc_gourmet_revenue', { p_from: null, p_to: null })
      ]);

      const totalRestaurantRevenue =
        restoRev?.reduce((sum, r) => sum + Number(r.restaurant_revenue || 0), 0) || 0;
      const totalDelivererRevenue =
        delivererRev?.reduce((sum, d) => sum + Number(d.deliverer_net_revenue || 0), 0) || 0;
      const totalGourmetRevenue =
        gourmetRev?.[0]?.total_revenue || 0;


      return res.json({
        totalOrders: totalOrders ? totalOrders.length : 0,
        totalRestaurants: totalRestaurants ? totalRestaurants.length : 0,
        activeRestaurants: totalActiveRestaurants ? totalActiveRestaurants.length : 0,
        activeDeliverers: totalDeliverers ? totalDeliverers.length : 0,
        monthlyOrders: monthlyOrders || [],
        revenues: {
          restaurants: totalRestaurantRevenue,
          deliverers: totalDelivererRevenue,
          gourmet: totalGourmetRevenue
        }
      });
    }

    // Regular page render
    // Fetch total restaurants
    const { data: totalRestaurants, error: restaurantError } = await supabase
      .from("restaurants")
      .select("*", { count: "exact" });

    if (restaurantError) {
      console.error("Error fetching restaurant data:", restaurantError);
    }

    // Fetch total active restaurants
    const { data: totalActiveRestaurants, error: activeRestaurantError } =
      await supabase
        .from("restaurants")
        .select("*", { count: "exact" })
        .eq("is_active", true);

    if (activeRestaurantError) {
      console.error("Error fetching restaurant data:", activeRestaurantError);
    }

    // Fetch total deliverers
    const { data: totalDeliverers, error: delivererError } = await supabase
      .from("deliverers")
      .select("*", { count: "exact" });

    if (delivererError) {
      console.error("Error fetching deliverer data:", delivererError);
    }

    // Fetch total orders
    const { data: totalOrders, error: orderError } = await supabase
      .from("orders")
      .select("*", { count: "exact" });

    if (orderError) {
      console.error("Error fetching orders data:", orderError);
    }

    // Fetch monthly orders data
    const { data: monthlyOrders, error: monthlyOrdersError } = await supabase.rpc(
      "get_monthly_orders"
    );

    if (monthlyOrdersError) {
      console.error("Error fetching monthly orders data:", monthlyOrdersError);
    }

    // Pass all data to the EJS template
    res.render("admin/dashboard", {
      totalOrders: totalOrders ? totalOrders.length : 0,
      totalRestaurants: totalRestaurants ? totalRestaurants.length : 0,
      totalActiveRestaurants: totalActiveRestaurants
        ? totalActiveRestaurants.length
        : 0,
      totalDeliverers: totalDeliverers ? totalDeliverers.length : 0,
      monthlyOrders: monthlyOrders || [],
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).send("An error occurred.");
  }
});

// Render the admin restaurants page
// Render the admin restaurants page
router.get("/restaurants", async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const pageSize = Number(limit);

    console.log("Fetching restaurants with pagination...", { page, limit, search });

    let query = supabase
      .from("restaurants")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (search) {
      query = query.ilike("name", `%${search}%`);
    }

    const { data: restaurants, count, error } = await query;

    if (error) {
      console.error("Error fetching restaurants:", error);
      throw new Error("Failed to fetch restaurants.");
    }

    const totalPages = Math.ceil(count / pageSize);

    // If it's an AJAX request (e.g. search), return JSON
    if (req.xhr || req.headers.accept?.includes('application/json')) {
       return res.json({
         restaurants,
         pagination: {
           currentPage: Number(page),
           totalPages,
           totalCount: count
         }
       });
    }

    res.render("admin/restaurants", {
      layout: "admin/layout",
      title: "Restaurants",
      restaurants: restaurants || [],
      pagination: {
        currentPage: Number(page),
        totalPages,
        pageSize,
        totalCount: count,
        hasNext: Number(page) < totalPages,
        hasPrev: Number(page) > 1
      },
      searchQuery: search
    });
  } catch (error) {
    console.error("Error fetching restaurants:", error.message);
    res.status(500).send("An error occurred while fetching restaurants.");
  }
});

// Export Restaurants
router.get("/restaurants/export", async (req, res) => {
  try {
    const { format = 'excel', search = '' } = req.query;
    
    let query = supabase
      .from("restaurants")
      .select("*")
      .order("created_at", { ascending: false });

    if (search) {
      query = query.ilike("name", `%${search}%`);
    }

    const { data: restaurants, error } = await query;
    if (error) throw error;

    const exportData = restaurants.map(r => ({
      name: r.name || 'N/A',
      address: r.address || 'N/A',
      type: r.type || 'N/A',
      phone: r.phone_number || 'N/A',
      email: r.email || 'N/A',
      status: r.is_active ? 'Actif' : 'Inactif',
      createdAt: new Date(r.created_at).toLocaleDateString('fr-FR')
    }));

    if (format === 'pdf') {
      const headers = ['Nom', 'Adresse', 'Type', 'Téléphone', 'Email', 'Statut', 'Date'];
      const keys = ['name', 'address', 'type', 'phone', 'email', 'status', 'createdAt'];
      const buffer = await exportToPdf(exportData, headers, keys, 'Liste des Restaurants');
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=restaurants.pdf');
      return res.send(buffer);
    } else {
      const columns = [
        { header: 'Nom', key: 'name', width: 20 },
        { header: 'Adresse', key: 'address', width: 30 },
        { header: 'Type', key: 'type', width: 15 },
        { header: 'Téléphone', key: 'phone', width: 15 },
        { header: 'Email', key: 'email', width: 25 },
        { header: 'Statut', key: 'status', width: 12 },
        { header: 'Date Inscription', key: 'createdAt', width: 15 }
      ];
      const buffer = await exportToExcel(exportData, columns, 'Restaurants');
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=restaurants.xlsx');
      return res.send(buffer);
    }
  } catch (error) {
    console.error("Export error:", error);
    res.status(500).send("Erreur lors de l'exportation");
  }
});


router.get("/payouts", async (req, res) => {
  const { status, target_type, limit = 50, offset = 0 } = req.query;

  try {
    let query = supabase
      .from("payout_batch_items")
      .select(
        `
        id,
        batch_id,
        payout_id,
        order_id,
        target_type,
        target_id,
        receive_amount,
        fee,
        status,
        error_code,
        error_message,
        created_at
      `
      )
      .order("created_at", { ascending: false })
      .range(Number(offset), Number(limit) - 1);

    if (status) query = query.eq("status", status);
    if (target_type) query = query.eq("target_type", target_type);

    const { data, error } = await query;

    if (error) {
      console.error("Payout load error:", error);
      return res.render("admin/payouts", {
        payouts: [],
        summary: {
          totalPayouts: 0,
          totalRestaurant: 0,
          totalDeliverer: 0
        }
      });
    }

    // Calcul résumé
    const summary = {
      totalPayouts: data.reduce((a, b) => a + (b.receive_amount || 0), 0),
      totalRestaurant: data
        .filter(x => x.target_type === "restaurant")
        .reduce((a, b) => a + (b.receive_amount || 0), 0),
      totalDeliverer: data
        .filter(x => x.target_type === "deliverer")
        .reduce((a, b) => a + (b.receive_amount || 0), 0)
    };

    return res.render("admin/payouts", {
      payouts: data,
      summary
    });
  } catch (err) {
    console.error(err);
    return res.render("admin/payouts", {
      payouts: [],
      summary: {
        totalPayouts: 0,
        totalRestaurant: 0,
        totalDeliverer: 0
      }
    });
  }
});

// Orders route
router.get("/orders", async (req, res) => {
  try {
    const { status, limit = 20, offset = 0, page = 1 } = req.query;
    const pageSize = Number(limit);
    const currentPage = Number(page);
    const currentOffset = (currentPage - 1) * pageSize;

    // Get total count for pagination
    let countQuery = supabase
      .from("orders")
      .select("*", { count: "exact", head: true });

    if (status) {
      countQuery = countQuery.eq("status", status);
    }

    const { count: totalCount } = await countQuery;

    // Fetch orders with user and restaurant relationships
    let query = supabase
      .from("orders")
      .select(`
        *,
        users!orders_user_id_fkey (
          id,
          name,
          phone_number
        ),
        restaurants!orders_restaurant_id_fkey (
          id,
          name,
          address
        ),
        order_items (
          quantity,
          price,
          menu_items (
            id,
            name,
            image_url,
            description
          )
        )
      `)
      .order("created_at", { ascending: false })
      .range(currentOffset, currentOffset + pageSize - 1);

    if (status) {
      query = query.eq("status", status);
    }

    const { data: orders, error } = await query;

    if (error) {
      console.error("Error fetching orders:", error);
      // Fallback: fetch orders without relationships and join manually
      let simpleQuery = supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false })
        .range(currentOffset, currentOffset + pageSize - 1);

      if (status) {
        simpleQuery = simpleQuery.eq("status", status);
      }

      const { data: simpleOrders, error: simpleError } = await simpleQuery;

      if (simpleError) {
        console.error("Error with simple query:", simpleError);
        throw new Error("Failed to fetch orders.");
      }

      // Fetch related data separately
      const ordersWithRelations = await Promise.all((simpleOrders || []).map(async (order) => {
        const [userResult, restaurantResult, itemsResult, delivererResult] = await Promise.all([
          supabase.from("users").select("id, name, phone_number").eq("id", order.user_id).single(),
          supabase.from("restaurants").select("id, name, address").eq("id", order.restaurant_id).single(),
          supabase.from("order_items")
            .select("quantity, price, menu_items(id, name, image_url, description)")
            .eq("order_id", order.id),
          order.deliverer_id ? supabase.from("deliverers").select("id, user_id").eq("id", order.deliverer_id).single() : Promise.resolve({ data: null })
        ]);

        return {
          ...order,
          user: userResult.data,
          restaurant: restaurantResult.data,
          order_items: itemsResult.data || [],
          deliverer: delivererResult.data
        };
      }));

      // Calculate summary statistics
      const { data: allOrders } = await supabase
        .from("orders")
        .select("status, total_amount");

      const summary = {
        total: allOrders?.length || 0,
        pending: allOrders?.filter(o => o.status === "Pending").length || 0,
        preparing: allOrders?.filter(o => o.status === "PREPARING").length || 0,
        delivering: allOrders?.filter(o => o.status === "DELIVERING").length || 0,
        completed: allOrders?.filter(o => o.status === "COMPLETED").length || 0,
        cancelled: allOrders?.filter(o => o.status === "CANCELLED").length || 0,
        totalRevenue: allOrders?.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0) || 0
      };

      const totalPages = Math.ceil((totalCount || 0) / pageSize);

      return res.render("admin/orders", {
        layout: "admin/layout",
        title: "Commandes",
        orders: ordersWithRelations || [],
        summary,
        pagination: {
          currentPage,
          totalPages,
          pageSize,
          totalCount: totalCount || 0,
          hasNext: currentPage < totalPages,
          hasPrev: currentPage > 1
        },
        currentStatus: status || ''
      });
    }

    // Normalize data structure and fetch deliverers separately
    const ordersWithDeliverers = await Promise.all((orders || []).map(async (order) => {
      // Normalize user and restaurant fields (Supabase might return as plural)
      const normalizedOrder = {
        ...order,
        user: order.user || order.users || null,
        restaurant: order.restaurant || order.restaurants || null
      };

      // Remove plural versions if they exist
      if (normalizedOrder.users) delete normalizedOrder.users;
      if (normalizedOrder.restaurants) delete normalizedOrder.restaurants;

      // Fetch deliverer if needed
      if (normalizedOrder.deliverer_id) {
        const { data: deliverer } = await supabase
          .from("deliverers")
          .select("id, user_id")
          .eq("id", normalizedOrder.deliverer_id)
          .single();
        normalizedOrder.deliverer = deliverer;
      }

      return normalizedOrder;
    }));

    // Calculate summary statistics
    const { data: allOrders } = await supabase
      .from("orders")
      .select("status, total_amount");

    const summary = {
      total: allOrders?.length || 0,
      pending: allOrders?.filter(o => o.status === "Pending").length || 0,
      preparing: allOrders?.filter(o => o.status === "PREPARING").length || 0,
      delivering: allOrders?.filter(o => o.status === "DELIVERING").length || 0,
      completed: allOrders?.filter(o => o.status === "COMPLETED").length || 0,
      cancelled: allOrders?.filter(o => o.status === "CANCELLED").length || 0,
      totalRevenue: allOrders?.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0) || 0
    };

    const totalPages = Math.ceil((totalCount || 0) / pageSize);

    res.render("admin/orders", {
      layout: "admin/layout",
      title: "Commandes",
      orders: ordersWithDeliverers || [],
      summary,
      pagination: {
        currentPage,
        totalPages,
        pageSize,
        totalCount: totalCount || 0,
        hasNext: currentPage < totalPages,
        hasPrev: currentPage > 1
      },
      currentStatus: status || ''
    });
  } catch (error) {
    console.error("Error fetching orders:", error.message);
    res.status(500).render("admin/orders", {
      layout: "admin/layout",
      title: "Commandes",
      orders: [],
      summary: {
        total: 0,
        pending: 0,
        preparing: 0,
        delivering: 0,
        completed: 0,
        cancelled: 0,
        totalRevenue: 0
      },
      pagination: {
        currentPage: 1,
        totalPages: 1,
        pageSize: pageSize,
        totalCount: 0,
        hasNext: false,
        hasPrev: false
      },
      currentStatus: ''
    });
  }
});

// Export Orders
router.get("/orders/export", async (req, res) => {
  try {
    const { format = 'excel', status = '' } = req.query;
    
    let query = supabase
      .from("orders")
      .select(`
        *,
        users!orders_user_id_fkey ( name, phone_number ),
        restaurants!orders_restaurant_id_fkey ( name )
      `)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data: orders, error } = await query;
    if (error) throw error;

    const exportData = orders.map(o => ({
      id: o.id.substring(0, 8),
      client: o.users?.name || 'N/A',
      restaurant: o.restaurants?.name || 'N/A',
      amount: o.total_amount || 0,
      status: o.status || 'N/A',
      date: new Date(o.created_at).toLocaleDateString('fr-FR') + ' ' + new Date(o.created_at).toLocaleTimeString('fr-FR')
    }));

    if (format === 'pdf') {
      const headers = ['ID', 'Client', 'Restaurant', 'Montant', 'Statut', 'Date'];
      const keys = ['id', 'client', 'restaurant', 'amount', 'status', 'date'];
      const buffer = await exportToPdf(exportData, headers, keys, 'Liste des Commandes');
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=commandes.pdf');
      return res.send(buffer);
    } else {
      const columns = [
        { header: 'ID', key: 'id', width: 15 },
        { header: 'Client', key: 'client', width: 25 },
        { header: 'Restaurant', key: 'restaurant', width: 25 },
        { header: 'Montant', key: 'amount', width: 15 },
        { header: 'Statut', key: 'status', width: 15 },
        { header: 'Date', key: 'date', width: 20 }
      ];
      const buffer = await exportToExcel(exportData, columns, 'Commandes');
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=commandes.xlsx');
      return res.send(buffer);
    }
  } catch (error) {
    console.error("Export error:", error);
    res.status(500).send("Erreur lors de l'exportation");
  }
});


// Revenues route
router.get("/revenues", async (req, res) => {
  try {
    const { from, to } = req.query;
    const dateFrom = from ? new Date(from) : null;
    const dateTo = to ? new Date(to) : null;

    const rpcParams = {
      p_from: dateFrom ? dateFrom.toISOString() : null,
      p_to: dateTo ? dateTo.toISOString() : null
    };

    // Fetch revenue data using the same functions as dashboard
    const [
      { data: restoRev, error: restoErr },
      { data: delivererRev, error: delivererErr },
      { data: gourmetRev, error: gourmetErr }
    ] = await Promise.all([
      supabase.rpc('rpc_restaurant_revenue', rpcParams),
      supabase.rpc('rpc_deliverer_revenue', rpcParams),
      supabase.rpc('rpc_gourmet_revenue', rpcParams)
    ]);

    const totalRestaurantRevenue =
      restoErr ? 0 : (restoRev?.reduce((sum, r) => sum + Number(r.restaurant_revenue || 0), 0) || 0);
    const totalDelivererRevenue =
      delivererErr ? 0 : (delivererRev?.reduce((sum, d) => sum + Number(d.deliverer_net_revenue || 0), 0) || 0);
    const totalGourmetRevenue =
      gourmetErr ? 0 : (gourmetRev?.[0]?.total_revenue || 0);

    const revenues = {
      restaurants: totalRestaurantRevenue,
      deliverers: totalDelivererRevenue,
      gourmet: totalGourmetRevenue
    };

    // Log the data for debugging purposes
    if (restoRev && restoRev.length > 0) {
      console.log('Restaurant Revenue Data Sample:', restoRev[0]);
    }

    // Fetch revenue breakdown by restaurant
    const restaurantBreakdown = restoErr ? [] : (restoRev || []).map(r => ({
      restaurantId: r.restaurant_id,
      restaurantName: r.restaurant_name || 'N/A',
      revenue: Number(r.restaurant_revenue || 0),
      orderCount: Number(r.order_count || r.orders || r.count || 0)
    })).sort((a, b) => b.revenue - a.revenue).slice(0, 10); // Top 10

    // Fetch revenue breakdown by deliverer
    const delivererBreakdown = delivererErr ? [] : (delivererRev || []).map(d => ({
      delivererId: d.deliverer_id,
      delivererName: d.deliverer_name || 'N/A',
      revenue: Number(d.deliverer_net_revenue || 0),
      orderCount: Number(d.order_count || d.orders || d.count || 0)
    })).sort((a, b) => b.revenue - a.revenue).slice(0, 10); // Top 10

    // Fetch total orders for revenue calculation explanation
    let totalOrdersQuery = supabase
      .from("orders")
      .select("total_amount, status, created_at")
      .eq("status", "COMPLETED");
    if (dateFrom) totalOrdersQuery = totalOrdersQuery.gte("created_at", dateFrom.toISOString());
    if (dateTo) totalOrdersQuery = totalOrdersQuery.lte("created_at", dateTo.toISOString());

    const { data: totalOrdersData } = await totalOrdersQuery;

    const totalOrderValue = totalOrdersData?.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0) || 0;

    // Fetch per-order revenue breakdown (where it came from)
    const { page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const pageSize = Number(limit);

    let revenueOrdersQuery = supabase
      .from("orders")
      .select(`
        id,
        total_amount,
        restaurant_payout,
        deliverer_payout,
        gourmet_payout,
        created_at,
        restaurants!orders_restaurant_id_fkey (
          name
        )
      `)
      .eq("status", "COMPLETED")
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (dateFrom) revenueOrdersQuery = revenueOrdersQuery.gte("created_at", dateFrom.toISOString());
    if (dateTo) revenueOrdersQuery = revenueOrdersQuery.lte("created_at", dateTo.toISOString());

    const { data: revenueOrdersRaw, error: revenueOrdersError } = await revenueOrdersQuery;
    if (revenueOrdersError) {
      console.error("Error fetching revenue orders:", revenueOrdersError);
    }

    const revenueOrders = (revenueOrdersRaw || []).map(o => ({
      id: o.id,
      total: Number(o.total_amount || 0),
      restaurantShare: Number(o.restaurant_payout || 0),
      delivererShare: Number(o.deliverer_payout || 0),
      gourmetShare: Number(o.gourmet_payout || 0),
      restaurantName: o.restaurants?.name || "N/A",
      createdAt: o.created_at
    }));

    const totalCount = totalOrdersData?.length || 0;
    const totalPages = Math.ceil(totalCount / pageSize);

    // Fetch monthly revenue data
    const { data: monthlyData, error: monthlyError } = await supabase.rpc("get_monthly_orders");

    if (monthlyError) {
      console.error("Error fetching monthly orders:", monthlyError);
    }

    res.render("admin/revenues", {
      layout: "admin/layout",
      title: "Revenus",
      revenues,
      monthlyData: monthlyData || [],
      restaurantBreakdown: restaurantBreakdown || [],
      delivererBreakdown: delivererBreakdown || [],
      totalOrderValue,
      revenueOrders,
      pagination: {
        currentPage: Number(page),
        totalPages,
        pageSize,
        totalCount,
        hasNext: Number(page) < totalPages,
        hasPrev: Number(page) > 1
      },
      filters: {
        from: from || "",
        to: to || ""
      }
    });
  } catch (error) {
    console.error("Error fetching revenues:", error.message);
    res.status(500).render("admin/revenues", {
      layout: "admin/layout",
      title: "Revenus",
      revenues: {
        restaurants: 0,
        deliverers: 0,
        gourmet: 0
      },
      monthlyData: [],
      restaurantBreakdown: [],
      delivererBreakdown: [],
      totalOrderValue: 0,
      revenueOrders: [],
      filters: {
        from: req.query.from || "",
        to: req.query.to || ""
      }
    });
  }
});

// Restaurant Details Route
router.get("/restaurants/:id/details", async (req, res) => {
  const { id } = req.params;

  try {
    // Fetch restaurant details
    const restaurantQuery = `
      query {
        restaurant(id: "${id}") {
          id
          name
          description
          address
          latitude
          longitude
          type
          openingHours {
            monday { open close }
            tuesday { open close }
            wednesday { open close }
            thursday { open close }
            friday { open close }
            saturday { open close }
            sunday { open close }
          }
          phoneNumber
          email
          imageUrl
          isActive
          createdAt
          updatedAt
        }
      }
    `;

    const restaurantResult = await graphqlRequest(restaurantQuery);
    const restaurant = restaurantResult.restaurant;

    if (!restaurant) {
      return res.status(404).send("Restaurant not found.");
    }

    // Fetch menu items
    const menuItemsQuery = `
      query {
        menuItems(restaurantId: "${id}") {
          id
          name
          description
          price
          imageUrl
          createdAt
        }
      }
    `;
    const menuItemsResult = await graphqlRequest(menuItemsQuery);
    const menuItems = menuItemsResult.menuItems || [];

    res.render("admin/restaurantDetails", {
      layout: "admin/layout",
      title: `Details of ${restaurant.name}`,
      restaurant,
      menuItems,
    });
  } catch (error) {
    console.error("Error fetching restaurant details:", error.message);
    res.status(500).send("An error occurred while fetching details.");
  }
});

// Upload restaurant image to local storage (replaces Supabase storage)
router.post("/upload", upload.single("image"), async (req, res) => {
  try {
    const { restaurantId } = req.body;
    if (!restaurantId) {
      return res.status(400).json({ error: "restaurantId is required" });
    }

    // Accept either multipart file (preferred) or base64 payload
    let buffer;
    let mimeType = "image/jpeg";

    if (req.file && req.file.buffer) {
      buffer = req.file.buffer;
      mimeType = req.file.mimetype || "image/jpeg";
    } else if (req.body.image) {
      const base64 = req.body.image.replace(/^data:image\/\\w+;base64,/, "");
      buffer = Buffer.from(base64, "base64");
    } else {
      return res.status(400).json({ error: "No image provided" });
    }

    const fileName = `${restaurantId}-${Date.now()}.jpg`;
    const uploadDir = path.join(ROOT_DIR, "public", "uploads", "restaurants");

    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    const filePath = path.join(uploadDir, fileName);
    await writeFile(filePath, buffer);

    const publicUrl = `/uploads/restaurants/${fileName}`;

    // Save the public URL in restaurants table
    const { error: dbError } = await supabase
      .from("restaurants")
      .update({ image_url: publicUrl })
      .eq("id", restaurantId);

    if (dbError) throw new Error(dbError.message);

    res.status(200).json({ message: "Image uploaded successfully", publicUrl });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Handle adding a new restaurant
router.post("/restaurants/add", requireRole(['admin']), async (req, res) => {
  try {
    const {
      name,
      description,
      address,
      type,
      phoneNumber,
      email,
      imageUrl,
      openingHours,
    } = req.body;

    // Format openingHours to GraphQL-compliant string
    const formattedOpeningHours = JSON.stringify(openingHours).replace(
      /"([^"]+)":/g,
      "$1:"
    );

    const mutation = `
      mutation {
        createRestaurant(input: {
          name: "${name}",
          description: "${description}",
          address: "${address}",
          type: ${type.toUpperCase()},
          phoneNumber: "${phoneNumber}",
          email: "${email}",
          imageUrl: "${imageUrl}",
          openingHours: ${formattedOpeningHours}
        }) {
          id
          name
          description
          address

        }
      }
    `;

    // Execute GraphQL request
    const { data, errors } = await graphqlRequest(mutation);

    if (errors) {
      console.error("GraphQL Errors:", errors);
      throw new Error(errors[0].message);
    }

    console.log(data);

    res.redirect("/admin/restaurants");
  } catch (error) {
    console.error("Error adding restaurant:", error);
    res.status(500).send("Failed to add restaurant.");
  }
});

// Handle toggling the restaurant's active status
router.post("/restaurants/:id/toggle", requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const mutation = `
      mutation {
        updateRestaurant(id: "${id}", input: { isActive: ${isActive} }) {
          id
        }
      }
    `;

    await graphqlRequest(mutation);

    res.redirect("/admin/restaurants");
  } catch (error) {
    console.error("Error toggling restaurant status:", error);
    res.status(500).send("Failed to update restaurant status.");
  }
});

// Handle deleting a restaurant
router.post("/restaurants/:id/delete", requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;

    const mutation = `
      mutation {
        deleteRestaurant(id: "${id}")
      }
    `;

    await graphqlRequest(mutation);

    res.redirect("/admin/restaurants");
  } catch (error) {
    console.error("Error deleting restaurant:", error);
    res.status(500).send("Failed to delete restaurant.");
  }
});

// Add Menu Item Route
router.post("/restaurants/:id/menu/add", async (req, res) => {
  const { id } = req.params;
  const { name, description, price, category, imageUrl } = req.body;

  console.log(req.body);

  try {
    const addMenuItemMutation = `
      mutation AddMenuItem($input: AddMenuItemInput!) {
        addMenuItem(input: $input) {
          id
          name
          description
          category
          imageUrl
          price
        }
      }
    `;

    const variables = {
      input: {
        name,
        description,
        price: parseFloat(price) || 0,
        category,
        imageUrl,
        restaurantId: id,
      },
    };

    const result = await graphqlRequest(addMenuItemMutation, variables);

    if (result.errors) {
      throw new Error(result.errors[0].message);
    }

    res.redirect(`/admin/restaurants/${id}/details`);
  } catch (error) {
    console.error("Error adding menu item:", error.message);
    res.status(500).send("Failed to add menu item.");
  }
});

router.post("/orders/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const mutation = `
      mutation UpdateOrderStatus($id: ID!, $status: OrderStatus!) {
        updateOrderStatus(id: $id, status: $status) {
          id
          status
        }
      }
    `;

    const variables = { id, status };

    await graphqlRequest(mutation, variables);

    res.status(200).json({ message: "Order status updated successfully." });
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({ error: "Failed to update order status." });
  }
});

// Add route for updating order notes
router.post("/orders/:id/note", async (req, res) => {
  const { id } = req.params;
  const { note } = req.body;

  try {
    const mutation = `
      mutation UpdateOrderNote($orderId: ID!, $note: String!) {
        updateOrderNote(orderId: $orderId, note: $note) {
          id
          note
        }
      }
    `;

    const variables = { orderId: id, note };

    await graphqlRequest(mutation, variables);

    res.status(200).json({ message: "Order note updated successfully." });
  } catch (error) {
    console.error("Error updating order note:", error);
    res.status(500).json({ error: "Failed to update order note." });
  }
});

// Render the deliverers page
// Render the deliverers page
router.get("/deliverers", async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const pageSize = Number(limit);

    console.log("Fetching deliverers with pagination...", { page, limit, search });

    let query = supabase
      .from("deliverers")
      .select(`
        *,
        users!inner (
          id,
          name,
          phone_number,
          profile_picture
        )
      `, { count: "exact" })
      .range(offset, offset + pageSize - 1)
      .order("created_at", { ascending: false });

    if (search) {
      // Search by user name (via relation) or zone
      // Note: Supabase ILIKE on foreign tables is supported with !inner join and special syntax
      // But simple way is to use "or" filter if possible, or just zone for now.
      // Searching relations is tricky. For now let's support searching by zone or maybe filter in code?
      // Filtering in code breaks pagination.
      // Let's assume search is mainly for zone or filtering by status if needed.
      // Or we can try: .ilike('users.name', `%${search}%`) if Supabase supports it?
      // Supabase JS doesn't support nested filtering neatly in one go easily without complications.
      // Let's stick to simple filters or search on deliverer fields (zone).
      // Or we can search on User table first then filter Deliverers.
      // For simplicity let's search zone only or skip complex search for this iteration.
      // Actually, let's try to search by zone.
       query = query.ilike("zone", `%${search}%`);
    }

    const { data: deliverers, count, error } = await query;

    if (error) {
      console.error("Error fetching deliverers:", error);
      throw new Error("Failed to fetch deliverers.");
    }

    // Transform the data to match the schema structure
    const formattedDeliverers = (deliverers || []).map(deliverer => ({
      userId: deliverer.user_id,
      user: deliverer.users,
      vehicleId: deliverer.vehicle_id,
      isAvailable: deliverer.is_available,
      currentLocation: deliverer.current_location,
      zone: deliverer.zone,
      profilePicture: deliverer.profile_picture,
      completedDeliveries: deliverer.completed_deliveries,
      isActive: deliverer.is_active,
      isVerified: deliverer.is_verified
    }));

    const totalPages = Math.ceil(count / pageSize);

    // Check if it's an AJAX request
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.json({
        deliverers: formattedDeliverers,
        pagination: {
           currentPage: Number(page),
           totalPages,
           totalCount: count
         }
      });
    }

    // Regular page render
    res.render("admin/deliverers", {
      layout: "admin/layout",
      title: "Livreurs",
      deliverers: formattedDeliverers || [],
      pagination: {
        currentPage: Number(page),
        totalPages,
        pageSize,
        totalCount: count,
        hasNext: Number(page) < totalPages,
        hasPrev: Number(page) > 1
      },
      searchQuery: search
    });
  } catch (error) {
    console.error("Error fetching deliverers:", error.message);
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(500).json({ error: "An error occurred while fetching deliverers." });
    }
    res.status(500).send("An error occurred while fetching deliverers.");
  }
});

// Export Deliverers
router.get("/deliverers/export", async (req, res) => {
  try {
    const { format = 'excel', search = '' } = req.query;
    
    let query = supabase
      .from("deliverers")
      .select(`
        *,
        users (
          name,
          phone_number
        )
      `)
      .order("created_at", { ascending: false });

    if (search) {
      query = query.ilike("zone", `%${search}%`);
    }

    const { data: deliverers, error } = await query;
    if (error) throw error;

    const exportData = deliverers.map(d => ({
      name: d.users?.name || 'N/A',
      phone: d.users?.phone_number || 'N/A',
      zone: d.zone || 'N/A',
      vehicleId: d.vehicle_id || 'N/A',
      status: d.is_available ? 'Disponible' : 'Occupé',
      deliveries: d.completed_deliveries || 0,
      createdAt: new Date(d.created_at).toLocaleDateString('fr-FR')
    }));

    if (format === 'pdf') {
      const headers = ['Nom', 'Téléphone', 'Zone', 'Véhicule', 'Statut', 'Livraisons', 'Date'];
      const keys = ['name', 'phone', 'zone', 'vehicleId', 'status', 'deliveries', 'createdAt'];
      const buffer = await exportToPdf(exportData, headers, keys, 'Liste des Livreurs');
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=livreurs.pdf');
      return res.send(buffer);
    } else {
      const columns = [
        { header: 'Nom', key: 'name', width: 20 },
        { header: 'Téléphone', key: 'phone', width: 15 },
        { header: 'Zone', key: 'zone', width: 15 },
        { header: 'Véhicule', key: 'vehicleId', width: 15 },
        { header: 'Statut', key: 'status', width: 12 },
        { header: 'Livraisons', key: 'deliveries', width: 12 },
        { header: 'Date Inscription', key: 'createdAt', width: 15 }
      ];
      const buffer = await exportToExcel(exportData, columns, 'Livreurs');
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=livreurs.xlsx');
      return res.send(buffer);
    }
  } catch (error) {
    console.error("Export error:", error);
    res.status(500).send("Erreur lors de l'exportation");
  }
});


// Get single deliverer details
router.get("/deliverers/:id", async (req, res) => {
  const { id } = req.params;

  try {
    console.log("Fetching deliverer with ID:", id);

    // Fetch deliverer with user information - use user_id since that's the primary key
    const { data: deliverer, error: delivererError } = await supabase
      .from("deliverers")
      .select(`
        *,
        users (
          id,
          name,
          phone_number,
          profile_picture
        )
      `)
      .eq("user_id", id)
      .single();

    if (delivererError) {
      console.error("Error fetching deliverer:", delivererError);
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(404).json({ error: "Deliverer not found." });
      }
      return res.status(404).render("error", {
        message: "Livreur non trouvé."
      });
    }

    console.log("Found deliverer:", deliverer);

    // Fetch deliverer's orders
    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select(`
        id,
        total_amount,
        status,
        created_at,
        delivery_address,
        users (
          name,
          phone_number
        )
      `)
      .eq("deliverer_id", deliverer.user_id)
      .order('created_at', { ascending: false });

    if (ordersError) {
      console.error("Error fetching orders:", ordersError);
      // Continue without orders
    }

    // Transform the data to match the template structure
    const formattedDeliverer = {
      userId: deliverer.user_id,
      user: deliverer.users,
      vehicleId: deliverer.vehicle_id,
      isAvailable: deliverer.is_available,
      currentLocation: deliverer.current_location,
      zone: deliverer.zone,
      profilePicture: deliverer.profile_picture,
      isActive: deliverer.is_active,
      isVerified: deliverer.is_verified,
      completedDeliveries: deliverer.completed_deliveries || 0,
      orders: orders || []
    };

    console.log("Formatted deliverer:", formattedDeliverer);

    // Check if it's an AJAX request
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.json(formattedDeliverer);
    }

    // Regular page render
    return res.render("admin/delivererDetails", {
      layout: "admin/layout",
      title: `Détails du Livreur - ${formattedDeliverer.user.name}`,
      deliverer: formattedDeliverer
    });
  } catch (error) {
    console.error("Error fetching deliverer details:", error.message);
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(500).json({ error: "An error occurred while fetching deliverer details." });
    }
    return res.status(500).render("error", {
      message: "Une erreur s'est produite lors du chargement des détails du livreur."
    });
  }
});

// Handle adding a new deliverer
router.post("/deliverers/add", requireRole(['admin']), async (req, res) => {
  try {
    const { name, phoneNumber, vehicleId, zone, profilePicture, isAvailable } = req.body;
    console.log("Adding new deliverer:", req.body);

    // Validate required fields
    if (!name || !phoneNumber || !zone) {
      return res.status(400).json({ error: "Name, phone number, and zone are required." });
    }

    // Check if phone number already exists
    const { data: existingUser, error: existingUserError } = await supabase
      .from("users")
      .select("phone_number")
      .eq("phone_number", phoneNumber)
      .single();

    if (existingUser) {
      return res.status(400).json({ error: "Phone number already registered." });
    }

    if (existingUserError && existingUserError.code !== "PGRST116") {
      console.error("Error checking phone number:", existingUserError);
      return res.status(500).json({ error: "Internal server error." });
    }

    // Set default password and hash it
    const defaultPassword = "12345678";
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    // Create user
    const { data: userData, error: userError } = await supabase
      .from("users")
      .insert({
        phone_number: phoneNumber,
        name,
        password: hashedPassword,
        role: "deliverer",
        is_verified: true, // Deliverers are verified by admin
        profile_picture: profilePicture || null // Add profile picture to user
      })
      .select()
      .single();

    if (userError) {
      console.error("Error creating user:", userError);
      return res.status(500).json({ error: "Failed to create user account." });
    }

    // Create deliverer record
    const { error: delivererError } = await supabase
      .from("deliverers")
      .insert({
        user_id: userData.id,
        vehicle_id: vehicleId || null,
        is_available: isAvailable || true,
        current_location: null,
        zone: zone,
        is_active: true,
        completed_deliveries: 0
      });

    if (delivererError) {
      console.error("Error creating deliverer record:", delivererError);
      // Clean up the user if deliverer creation fails
      await supabase.from("users").delete().eq("id", userData.id);
      return res.status(500).json({ error: "Failed to create deliverer record." });
    }

    res.status(201).json({
      message: "Deliverer added successfully",
      user: userData,
      defaultPassword: defaultPassword // Include the default password in the response
    });
  } catch (error) {
    console.error("Error adding deliverer:", error);
    res.status(500).json({ error: "Failed to add deliverer: " + error.message });
  }
});

// Handle updating a deliverer
router.post("/deliverers/:id/update", requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phoneNumber, vehicleId, zone, profilePicture, isAvailable, isActive } = req.body;

    // First update the user
    const { error: userError } = await supabase
      .from("users")
      .update({
        name,
        phone_number: phoneNumber,
        profile_picture: profilePicture || null // Update profile picture in user
      })
      .eq("id", id);

    if (userError) {
      console.error("Error updating user:", userError);
      return res.status(500).json({ error: "Failed to update user information." });
    }

    // Then update the deliverer
    const { error: delivererError } = await supabase
      .from("deliverers")
      .update({
        vehicle_id: vehicleId,
        zone: zone,
        is_available: isAvailable,
        is_active: isActive
      })
      .eq("user_id", id);

    if (delivererError) {
      console.error("Error updating deliverer:", delivererError);
      return res.status(500).json({ error: "Failed to update deliverer information." });
    }

    res.json({ message: "Deliverer updated successfully" });
  } catch (error) {
    console.error("Error updating deliverer:", error);
    res.status(500).json({ error: "An error occurred while updating the deliverer." });
  }
});

// Delete deliverer
router.post("/deliverers/:id/delete", requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  try {
    // First get the deliverer to find the user_id
    const { data: deliverer, error: fetchError } = await supabase
      .from("deliverers")
      .select("user_id")
      .eq("user_id", id)
      .single();

    if (fetchError) {
      console.error("Error fetching deliverer:", fetchError);
      return res.status(404).json({ error: "Deliverer not found." });
    }

    // Delete the deliverer record
    const { error: deleteDelivererError } = await supabase
      .from("deliverers")
      .delete()
      .eq("user_id", id);

    if (deleteDelivererError) {
      console.error("Error deleting deliverer:", deleteDelivererError);
      return res.status(500).json({ error: "Failed to delete deliverer." });
    }

    // Delete the user record
    const { error: deleteUserError } = await supabase
      .from("users")
      .delete()
      .eq("id", id);

    if (deleteUserError) {
      console.error("Error deleting user:", deleteUserError);
      return res.status(500).json({ error: "Failed to delete user." });
    }

    res.json({ message: "Deliverer deleted successfully." });
  } catch (error) {
    console.error("Error deleting deliverer:", error);
    res.status(500).json({ error: "An error occurred while deleting the deliverer." });
  }
});

// Handle toggling deliverer availability
router.post("/deliverers/:id/toggle", requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { isAvailable } = req.body;

    const { error } = await supabase
      .from("deliverers")
      .update({ is_available: isAvailable })
      .eq("id", id);

    if (error) {
      throw new Error(error.message);
    }

    res.redirect("/admin/deliverers");
  } catch (error) {
    console.error("Error toggling deliverer availability:", error);
    res.status(500).send("Failed to update deliverer availability.");
  }
});

// GraphQL Schema for Restaurants
const typeDefs = gql`
  type Restaurant {
    id: ID!
    name: String!
    description: String
    address: String
    type: String
    phoneNumber: String
    email: String
    imageUrl: String
    isActive: Boolean
    openingHours: String
    menuItems: [MenuItem]
  }

  type MenuItem {
    id: ID!
    name: String!
    description: String
    price: Float!
    category: String!
    imageUrl: String
    restaurantId: ID!
    createdAt: String
    updatedAt: String
  }

  type Deliverer {
    id: ID!
    name: String!
    email: String!
    phoneNumber: String!
    imageUrl: String
    isAvailable: Boolean!
    completedDeliveries: Int!
    createdAt: String!
    updatedAt: String!
    orders: [Order]
  }

  type Order {
    id: ID!
    totalAmount: Float!
    status: String!
    createdAt: String!
    deliveryAddress: DeliveryAddress
    user: User
  }

  type DeliveryAddress {
    address: String!
    latitude: Float!
    longitude: Float!
  }

  type User {
    name: String!
    phoneNumber: String!
  }

  type Query {
    restaurants: [Restaurant]
    restaurant(id: ID!): Restaurant
    deliverers: [Deliverer]
    deliverer(id: ID!): Deliverer
    menuItems(restaurantId: ID!): [MenuItem]
    menuItem(id: ID!): MenuItem
  }

  type Mutation {
    addRestaurant(
      name: String!
      description: String
      address: String
      type: String
      phoneNumber: String
      email: String
      imageUrl: String
      isActive: Boolean
      openingHours: String
    ): Restaurant

    createDeliverer(
      name: String!
      email: String!
      phoneNumber: String!
      profilePicture: String
      isAvailable: Boolean!
    ): Deliverer

    updateDeliverer(
      id: ID!
      input: DelivererInput!
    ): Deliverer

    deleteDeliverer(id: ID!): Boolean

    addMenuItem(
      input: MenuItemInput!
    ): MenuItem

    updateMenuItem(
      id: ID!
      input: MenuItemInput!
    ): MenuItem

    deleteMenuItem(id: ID!): Boolean

    updateDelivererLocation(
      id: ID!
      location: String!
    ): Deliverer
  }

  input MenuItemInput {
    name: String!
    description: String
    price: Float!
    category: String!
    imageUrl: String
    restaurantId: ID
  }

  input DelivererInput {
    name: String
    email: String
    phoneNumber: String
    imageUrl: String
    isAvailable: Boolean
  }

  input CreateDelivererInput {
    vehicleId: ID
    isAvailable: Boolean
    currentLocation: String
    zone: String
    profilePicture: String
  }
`;

// GraphQL Resolvers for Restaurants
const resolvers = {
  Query: {
    restaurants: async () => {
      const { data, error } = await supabase.from("restaurants").select("*");
      if (error) throw new Error("Error fetching restaurants.");
      return data;
    },
    restaurant: async (_, { id }) => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw new Error("Error fetching restaurant.");
      return data;
    },
    deliverers: async () => {
      const { data, error } = await supabase.from("deliverers").select("*");
      if (error) throw new Error("Error fetching deliverers.");
      return data;
    },
    deliverer: async (_, { id }) => {
      const { data, error } = await supabase
        .from("deliverers")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw new Error("Error fetching deliverer.");
      return data;
    },
    menuItems: async (_, { restaurantId }) => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("*")
        .eq("restaurant_id", restaurantId);
      if (error) throw new Error("Error fetching menu items.");
      return data;
    },
    menuItem: async (_, { id }) => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw new Error("Error fetching menu item.");
      return data;
    }
  },
  Mutation: {
    addRestaurant: async (_, args) => {
      const { data, error } = await supabase
        .from("restaurants")
        .insert(args)
        .select()
        .single();
      if (error) throw new Error("Error adding restaurant.");
      return data;
    },
    createDeliverer: async (_, args) => {
      const { data, error } = await supabase
        .from("deliverers")
        .insert(args)
        .select()
        .single();
      if (error) throw new Error("Error adding deliverer.");
      return data;
    },
    updateDeliverer: async (_, { id, input }) => {
      const { data, error } = await supabase
        .from("deliverers")
        .update(input)
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error("Error updating deliverer.");
      return data;
    },
    deleteDeliverer: async (_, { id }) => {
      const { error } = await supabase
        .from("deliverers")
        .delete()
        .eq("id", id);
      if (error) throw new Error("Error deleting deliverer.");
      return true;
    },
    addMenuItem: async (_, { input }) => {
      const { data, error } = await supabase
        .from("menu_items")
        .insert({
          name: input.name,
          description: input.description,
          price: input.price,
          category: input.category,
          image_url: input.imageUrl,
          restaurant_id: input.restaurantId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      if (error) throw new Error("Error adding menu item.");
      return {
        id: data.id,
        name: data.name,
        description: data.description,
        price: data.price,
        category: data.category,
        imageUrl: data.image_url,
        restaurantId: data.restaurant_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      };
    },
    updateMenuItem: async (_, { id, input }) => {
      // Build the update object dynamically
      const updateObj = {
        name: input.name,
        description: input.description,
        price: input.price,
        category: input.category,
        updated_at: new Date().toISOString()
      };
      if (typeof input.imageUrl === 'string' && input.imageUrl.trim() !== '') {
        updateObj.image_url = input.imageUrl;
      }
      const { data, error } = await supabase
        .from("menu_items")
        .update(updateObj)
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error("Error updating menu item.");
      return {
        id: data.id,
        name: data.name,
        description: data.description,
        price: data.price,
        category: data.category,
        imageUrl: data.image_url,
        restaurantId: data.restaurant_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      };
    },
    deleteMenuItem: async (_, { id }) => {
      const { error } = await supabase
        .from("menu_items")
        .delete()
        .eq("id", id);
      if (error) throw new Error("Error deleting menu item.");
      return true;
    },
    updateDelivererLocation: async (_, { id, location }) => {
      const { data, error } = await supabase
        .from("deliverers")
        .update({
          current_location: location,
          updated_at: new Date().toISOString()
        })
        .eq("user_id", id)
        .select()
        .single();

      if (error) throw new Error("Error updating deliverer location.");
      return data;
    }
  }
};

// Setup ApolloServer for GraphQL
// DISABLED: This is redundant and causes memory exhaustion on cPanel.
// All GraphQL functionality is handled in server.js
/*
const graphqlServer = new ApolloServer({
  typeDefs,
  resolvers,
  persistedQueries: false, 
  cache: "bounded",       
  context: ({ req }) => {
    return {};
  },
});

const initGraphQL = async () => {
  try {
    await graphqlServer.start();
    graphqlServer.applyMiddleware({ app: router, path: "/graphql" });
    console.log("GraphQL server initialized successfully");
  } catch (error) {
    console.error("Error initializing GraphQL server:", error);
  }
};

initGraphQL();
*/

// Add more routes for other admin functionalities (e.g., orders, deliverers)

// Render the admin login page
router.get("/admin/login", (req, res) => {
  res.render("admin/adminLogin");
});

// Render the restaurant login page
router.get("/restaurant/login", (req, res) => {
  res.render("admin/restaurantLogin");
});

// Add route for restaurant menu page
router.get("/restaurant/menu", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ error: "Access denied. No token provided." });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== "restaurant") {
      return res.status(403).json({ error: "Access denied. Restaurant only." });
    }

    const restaurantId = decoded.id;

    // Fetch restaurant details
    const { data: restaurant, error: restaurantError } = await supabase
      .from("restaurants")
      .select("*")
      .eq("id", restaurantId)
      .single();

    if (restaurantError) {
      throw new Error("Error fetching restaurant details");
    }

    // Fetch menu items
    const { data: menuItems, error: menuError } = await supabase
      .from("menu_items")
      .select("*")
      .eq("restaurant_id", restaurantId);

    if (menuError) {
      throw new Error("Error fetching menu items");
    }

    res.render("restaurant/menu", {
      restaurant,
      menuItems: menuItems || []
    });
  } catch (error) {
    console.error("Error in menu page:", error);
    res.status(500).send("An error occurred while loading the menu page.");
  }
});

// Catch-all route for undefined routes
router.get('*', (req, res) => {
  res.status(404).send('Page not found');
});

export default router;
