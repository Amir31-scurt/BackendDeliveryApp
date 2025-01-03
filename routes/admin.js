import { ApolloServer, gql } from "apollo-server-express";
import bcrypt from "bcrypt";
import express from "express";
import jwt from "jsonwebtoken";
import { supabase } from "../supabaseClient.js";
import { graphqlRequest } from "../utils/graphqlClient.js";

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
router.get("/dashboard", async (req, res) => {
  try {
    // Fetch total restaurants
    const { data: totalRestaurants, error: restaurantError } = await supabase
      .from("restaurants")
      .select("*", { count: "exact" });

    if (restaurantError) {
      console.error("Error fetching restaurant data:", restaurantError);
    }

    // Fetch total deliverers
    const { data: totalDeliverers, error: delivererError } = await supabase
      .from("deliverers")
      .select("*", { count: "exact" });

    if (delivererError) {
      console.error("Error fetching deliverer data:", delivererError);
    }

    // Fetch total orders (example logic, adjust to your database schema)
    const { data: totalOrders, error: orderError } = await supabase
      .from("orders")
      .select("*", { count: "exact" });

    if (orderError) {
      console.error("Error fetching orders data:", orderError);
    }

    // Pass all data to the EJS template
    res.render("admin/dashboard", {
      totalOrders: totalOrders ? totalOrders.length : 0,
      totalRestaurants: totalRestaurants ? totalRestaurants.length : 0,
      totalDeliverers: totalDeliverers ? totalDeliverers.length : 0,
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

    console.log("Fetched restaurants:", restaurants);

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

export default router;
