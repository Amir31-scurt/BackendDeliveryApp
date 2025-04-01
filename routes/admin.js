import { ApolloServer, gql } from "apollo-server-express";
import bcrypt from "bcrypt";
import express from "express";
import jwt from "jsonwebtoken";
import { graphqlRequest } from "../utils/graphqlClient.js";
import { pool } from "../server.js";


const router = express.Router();

export const isAdmin = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1]; // Extract token from `Authorization` header
  console.log(req.headers);

  if (!token) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET); // Verify the token
    if (decoded.role !== "admin") {
      return res.status(403).json({ error: "Access denied. Admins only." });
    }

    req.user = decoded; // Attach user information to the request object
    next();
  } catch (error) {
    console.error("Token verification failed:", error);
    return res.status(401).json({ error: "Invalid token." });
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
    const query = 'SELECT * FROM users WHERE phone_number = $1 AND role = $2';
    const { rows } = await pool.query(query, [phoneNumber, "admin"]);
    const user = rows[0];

    if (!user) {
      return res.status(404).json({ error: "Admin not found." });
    }

    // Log retrieved user data
    console.log("Retrieved User:", user);

    const isValidPassword = await bcrypt.compare(password, user.password);
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
      user,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "An error occurred during login." });
  }
});

router.get("/login", (req, res) => {
  res.render("admin/login");
});

// Restaurant login route
router.post("/login/restaurant", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required." });
  }

  try {
    const query = 'SELECT * FROM restaurants WHERE email = $1';
    const { rows } = await pool.query(query, [email]);
    const data = rows[0];

    if (!data) {
      return res.status(404).json({ error: "Restaurant not found." });
    }

    const token = jwt.sign({ id: data.id, role: "restaurant" }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    return res.status(200).json({
      message: "Login successful.",
      token,
      restaurant: data,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "An error occurred during login." });
  }
});

router.get("/login/restaurant", (req, res) => {
  res.render("admin/restaurantLogin");
});

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
  res.clearCookie("token");
  localStorage.removeItem("authToken");
  req.session.destroy((err) => {
    if (err) {
      console.error("Session destruction error:", err);
      return res.status(500).json({ error: "Failed to logout." });
    }
    res.status(200).json({ message: "Logout successful." });
  });
});

// Dashboard route
router.get("/dashboard", async (req, res) => {
  try {
    // Fetch total restaurants
    const restaurantQuery = 'SELECT COUNT(*) FROM restaurants';
    const { rows: totalRestaurantsRows } = await pool.query(restaurantQuery);
    const totalRestaurants = totalRestaurantsRows[0].count;

    // Fetch total active restaurants
    const activeRestaurantQuery = 'SELECT COUNT(*) FROM restaurants WHERE is_active = true';
    const { rows: totalActiveRestaurantsRows } = await pool.query(activeRestaurantQuery);
    const totalActiveRestaurants = totalActiveRestaurantsRows[0].count;

    // Fetch total deliverers
    const delivererQuery = 'SELECT COUNT(*) FROM deliverers';
    const { rows: totalDeliverersRows } = await pool.query(delivererQuery);
    const totalDeliverers = totalDeliverersRows[0].count;

    // Fetch total orders
    const orderQuery = 'SELECT COUNT(*) FROM orders';
    const { rows: totalOrdersRows } = await pool.query(orderQuery);
    const totalOrders = totalOrdersRows[0].count;

    // Fetch monthly orders data
    const monthlyOrdersQuery = 'SELECT * FROM get_monthly_orders()';
    const { rows: monthlyOrders } = await pool.query(monthlyOrdersQuery);

    // Pass all data to the EJS template
    res.render("admin/dashboard", {
      totalOrders,
      totalRestaurants,
      totalActiveRestaurants,
      totalDeliverers,
      monthlyOrders: monthlyOrders || [],
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).send("An error occurred.");
  }
});

// Render the admin restaurants page
router.get("/restaurants", async (req, res) => {
  try {
    console.log("Fetching restaurants...");
    const query = `
      query {
        restaurants {
          id
          name
          description
          address
          type
          phoneNumber
          email
          imageUrl
          isActive
          createdAt
          updatedAt
        }
      }
    `;
    const restaurants = await graphqlRequest(query);

    if (!restaurants || !restaurants.restaurants) {
      console.error("No restaurants found or restaurants undefined.");
      throw new Error("Failed to fetch restaurants.");
    }

    res.render("admin/restaurants", {
      layout: "admin/layout",
      title: "Restaurants",
      restaurants: restaurants.restaurants,
    });
  } catch (error) {
    console.error("Error fetching restaurants:", error.message);
    res.status(500).send("An error occurred while fetching restaurants.");
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

router.post("/upload", async (req, res) => {
  try {
    const { image, restaurantId } = req.body; // Ensure image is sent as a base64 or binary file
    const fileName = `${restaurantId}-${Date.now()}.jpg`;

    // Save the public URL in your restaurants table
    const updateQuery = 'UPDATE restaurants SET image_url = $1 WHERE id = $2';
    await pool.query(updateQuery, [fileName, restaurantId]);

    res.status(200).json({ message: "Image uploaded successfully", publicUrl: fileName });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Handle adding a new restaurant
router.post("/restaurants/add", isAdmin, async (req, res) => {
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
router.post("/restaurants/:id/toggle", isAdmin, async (req, res) => {
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
router.post("/restaurants/:id/delete", isAdmin, async (req, res) => {
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
      mutation {
        addMenuItem(input: {
          name: "${name}",
          description: "${description}",
          price: ${parseFloat(price)},
          category: ${category},
          imageUrl: ${imageUrl},
          restaurantId: "${id}"
        }) {
          id
          name
          description
          category
          imageUrl
          price
        }
      }
    `;

    const result = await graphqlRequest(addMenuItemMutation);

    if (result.errors) {
      throw new Error(result.errors[0].message);
    }

    res.redirect(`/admin/restaurants/${id}/details`);
  } catch (error) {
    console.error("Error adding menu item:", error.message);
    res.status(500).send("Failed to add menu item.");
  }
});

// Render the restaurant dashboard
router.get("/restaurants/:id/orders", async (req, res) => {
  const { id } = req.params;

  try {
    const query = `
      query {
        restaurant(id: "${id}") {
          name
          address
          phoneNumber
          imageUrl
          email
          type
        }
        orders(restaurantId: "${id}") {
          id
          totalAmount
          deliveryAddress {
            address
            latitude
            longitude
          }
          userId
          user {
            name
          }
          instructions
          createdAt
          status
        }
      }
    `;
    const result = await graphqlRequest(query);
    const restaurant = result.restaurant || {};
    const orders = result.orders || [];

    res.render("restaurant/dashboard", {
      layout: "restaurant/layout",
      title: "Orders Dashboard",
      restaurant,
      orders,
    });
  } catch (error) {
    console.error("Error fetching restaurant or orders:", error.message);
    res.status(500).send("An error occurred while fetching data.");
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
  }

  type Query {
    restaurants: [Restaurant]
    restaurant(id: ID!): Restaurant
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
  }
`;

// GraphQL Resolvers for Restaurants
const resolvers = {
  Query: {
    restaurants: async () => {
      const query = 'SELECT * FROM restaurants';
      const { rows } = await pool.query(query);
      return rows;
    },
    restaurant: async (_, { id }) => {
      const query = 'SELECT * FROM restaurants WHERE id = $1';
      const { rows } = await pool.query(query, [id]);
      const data = rows[0];
      if (!data) throw new Error("Error fetching restaurant.");
      return data;
    },
  },
  Mutation: {
    addRestaurant: async (_, args) => {
      const insertQuery = `
        INSERT INTO restaurants (name, description, address, type, phone_number, email, image_url, is_active, opening_hours)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *;
      `;
      const values = [args.name, args.description, args.address, args.type, args.phoneNumber, args.email, args.imageUrl, args.isActive, args.openingHours];
      const { rows } = await pool.query(insertQuery, values);
      const data = rows[0];
      if (!data) throw new Error("Error adding restaurant.");
      return data;
    },
  },
};

// Setup ApolloServer for GraphQL
const graphqlServer = new ApolloServer({
  typeDefs,
  resolvers,
  context: ({ req }) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) throw new Error("Unauthorized");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return { userId: decoded.id };
  },
});

await graphqlServer.start();
graphqlServer.applyMiddleware({ app: router, path: "/graphql" });

// Add more routes for other admin functionalities (e.g., orders, deliverers)

// Render the admin login page
router.get("/admin/login", (req, res) => {
  res.render("admin/adminLogin");
});

// Render the restaurant login page
router.get("/restaurant/login", (req, res) => {
  res.render("admin/restaurantLogin");
});

export default router;
