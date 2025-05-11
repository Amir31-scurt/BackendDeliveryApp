import {ApolloServer, gql} from "apollo-server-express";
import bcrypt from "bcrypt";
import express from "express";
import jwt from "jsonwebtoken";
import {supabase} from "../supabaseClient.js";
import {graphqlRequest} from "../utils/graphqlClient.js";

const router = express.Router();

export const isAdmin = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1]; // Extract token from `Authorization` header
  console.log(req.headers);

  if (!token) {
    return res.status(401).json({error: "Access denied. No token provided."});
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET); // Verify the token
    if (decoded.role !== "admin") {
      return res.status(403).json({error: "Access denied. Admins only."});
    }

    req.user = decoded; // Attach user information to the request object
    next();
  } catch (error) {
    console.error("Token verification failed:", error);
    return res.status(401).json({error: "Invalid token."});
  }
};

// Admin login route
router.post("/login", async (req, res) => {
  const {phoneNumber, password} = req.body;

  if (!phoneNumber || !password) {
    return res
      .status(400)
      .json({error: "Phone number and password are required."});
  }

  try {
    const {data, error} = await supabase
      .from("users")
      .select("*")
      .eq("phone_number", phoneNumber)
      .eq("role", "admin");

    if (error) {
      console.error(error);
      return res.status(404).json({error: "Admin not found."});
    }

    // Handle no matching user
    if (!data) {
      return res.status(404).json({error: "Admin not found."});
    }

    const user = data;

    // Log retrieved user data
    console.log("Retrieved User:", user[0]);

    const isValidPassword = await bcrypt.compare(password, user[0].password);
    if (!isValidPassword) {
      return res.status(400).json({error: "Invalid credentials."});
    }

    // Generate JWT token with admin role
    const token = jwt.sign(
      {
        id: user[0].id,
        role: "admin",
        phoneNumber: user[0].phone_number
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "1d",
      }
    );

    res.status(200).json({
      message: "Login successful.",
      token,
      user: user[0],
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({error: "An error occurred during login."});
  }
});

router.get("/login", (req, res) => {
  res.render("admin/login");
});

// Restaurant login route
router.post("/login/restaurant", async (req, res) => {
  const {email} = req.body;

  if (!email) {
    return res.status(400).json({error: "Email is required."});
  }

  try {
    const {data, error} = await supabase
      .from("restaurants")
      .select("*")
      .eq("email", email)
      .single();

    if (error || !data) {
      return res.status(404).json({error: "Restaurant not found."});
    }

    const token = jwt.sign(
      {id: data.id, role: "restaurant"},
      process.env.JWT_SECRET,
      {
        expiresIn: "1d",
      }
    );

    return res.status(200).json({
      message: "Login successful.",
      token,
      restaurant: data,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({error: "An error occurred during login."});
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
      return res.status(500).json({error: "Failed to logout."});
    }
    res.clearCookie("token");
    res.clearCookie("restaurant");
    res.clearCookie("user");
    res.clearCookie("deliverer");
    localStorage.removeItem("authToken");
    localStorage.removeItem("restaurant");
    localStorage.removeItem("user");
    localStorage.removeItem("deliverer");
    res.status(200).json({message: "Logout successful."});
  });
});

router.get("/logout", (req, res) => {
  res.clearCookie("token");
  localStorage.removeItem("authToken");
  req.session.destroy((err) => {
    if (err) {
      console.error("Session destruction error:", err);
      return res.status(500).json({error: "Failed to logout."});
    }
    res.status(200).json({message: "Logout successful."});
  });
});

// Dashboard route
router.get("/dashboard", async (req, res) => {
  try {
    // Fetch total restaurants
    const {data: totalRestaurants, error: restaurantError} = await supabase
      .from("restaurants")
      .select("*", {count: "exact"});

    if (restaurantError) {
      console.error("Error fetching restaurant data:", restaurantError);
    }

    // Fetch total active restaurants
    const {data: totalActiveRestaurants, error: activeRestaurantError} =
      await supabase
        .from("restaurants")
        .select("*", {count: "exact"})
        .eq("is_active", true);

    if (activeRestaurantError) {
      console.error("Error fetching restaurant data:", activeRestaurantError);
    }

    // Fetch total deliverers
    const {data: totalDeliverers, error: delivererError} = await supabase
      .from("deliverers")
      .select("*", {count: "exact"});

    if (delivererError) {
      console.error("Error fetching deliverer data:", delivererError);
    }

    // Fetch total orders
    const {data: totalOrders, error: orderError} = await supabase
      .from("orders")
      .select("*", {count: "exact"});

    if (orderError) {
      console.error("Error fetching orders data:", orderError);
    }

    // Fetch monthly orders data
    const {data: monthlyOrders, error: monthlyOrdersError} = await supabase.rpc(
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
  const {id} = req.params;

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
    const {image, restaurantId} = req.body; // Ensure image is sent as a base64 or binary file
    const fileName = `${restaurantId}-${Date.now()}.jpg`;

    const {data, error} = await supabase.storage
      .from("restaurant-images")
      .upload(fileName, image, {
        contentType: "image/jpeg",
      });

    if (error) throw new Error(error.message);

    const {publicUrl} = supabase.storage
      .from("restaurant-images")
      .getPublicUrl(fileName);

    // Save the public URL in your restaurants table
    const {error: dbError} = await supabase
      .from("restaurants")
      .update({image_url: publicUrl})
      .eq("id", restaurantId);

    if (dbError) throw new Error(dbError.message);

    res.status(200).json({message: "Image uploaded successfully", publicUrl});
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({error: err.message});
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
    const {data, errors} = await graphqlRequest(mutation);

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
    const {id} = req.params;
    const {isActive} = req.body;

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
    const {id} = req.params;

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
  const {id} = req.params;
  const {name, description, price, category, imageUrl} = req.body;

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
  const {id} = req.params;

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
            phoneNumber
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
  const {id} = req.params;
  const {status} = req.body;

  try {
    const mutation = `
      mutation UpdateOrderStatus($id: ID!, $status: OrderStatus!) {
        updateOrderStatus(id: $id, status: $status) {
          id
          status
        }
      }
    `;

    const variables = {id, status};

    await graphqlRequest(mutation, variables);

    res.status(200).json({message: "Order status updated successfully."});
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({error: "Failed to update order status."});
  }
});

// Render the deliverers page
router.get("/deliverers", async (req, res) => {
  try {
    console.log("Fetching deliverers...");
    const { data: deliverers, error } = await supabase
      .from("deliverers")
      .select(`
        *,
        users (
          id,
          name,
          phone_number,
          profile_picture
        )
      `);

    if (error) {
      console.error("Error fetching deliverers:", error);
      throw new Error("Failed to fetch deliverers.");
    }

    console.log(deliverers)
    

    // Transform the data to match the schema structure
    const formattedDeliverers = deliverers.map(deliverer => ({
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

    res.render("admin/deliverers", {
      layout: "admin/layout",
      title: "Livreurs",
      deliverers: formattedDeliverers || [],
    });
  } catch (error) {
    console.error("Error fetching deliverers:", error.message);
    res.status(500).send("An error occurred while fetching deliverers.");
  }
});

// Get single deliverer details
router.get("/deliverers/:id", async (req, res) => {
  const { id } = req.params;
  const token = req.headers.authorization?.split(" ")[1];

  // If no token in header, check if this is a page view request
  if (!token) {
    // For page view requests, we'll render the template
    try {
      // Fetch deliverer with user information
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
        return res.status(404).render("error", {
          message: "Livreur non trouvé."
        });
      }

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
        .eq("deliverer_id", id)
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

      // Render the template
      return res.render("admin/delivererDetails", {
        layout: "admin/layout",
        title: `Détails du Livreur - ${formattedDeliverer.user.name}`,
        deliverer: formattedDeliverer
      });
    } catch (error) {
      console.error("Error fetching deliverer details:", error.message);
      return res.status(500).render("error", {
        message: "Une erreur s'est produite lors du chargement des détails du livreur."
      });
    }
  }

  // For API requests (with token)
  try {
    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== "admin") {
      return res.status(403).json({ error: "Access denied. Admins only." });
    }

    // Fetch deliverer with user information
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
      return res.status(404).json({ error: "Deliverer not found." });
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
      completedDeliveries: deliverer.completed_deliveries || 0
    };

    return res.json(formattedDeliverer);
  } catch (error) {
    console.error("Error fetching deliverer details:", error.message);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: "Invalid token." });
    }
    return res.status(500).json({ error: "Une erreur s'est produite lors du chargement des détails du livreur." });
  }
});

// Handle adding a new deliverer
router.post("/deliverers/add", isAdmin, async (req, res) => {
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
        is_verified: true // Deliverers are verified by admin
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
        profile_picture: profilePicture || null,
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
router.post("/deliverers/:id/update", isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phoneNumber, vehicleId, zone, profilePicture, isAvailable, isActive } = req.body;

    // First update the user
    const { error: userError } = await supabase
      .from("users")
      .update({
        name,
        phone_number: phoneNumber,
        profile_picture: profilePicture
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
        profile_picture: profilePicture,
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
router.post("/deliverers/:id/delete", isAdmin, async (req, res) => {
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
router.post("/deliverers/:id/toggle", isAdmin, async (req, res) => {
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
      imageUrl: String
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
      const {data, error} = await supabase.from("restaurants").select("*");
      if (error) throw new Error("Error fetching restaurants.");
      return data;
    },
    restaurant: async (_, {id}) => {
      const {data, error} = await supabase
        .from("restaurants")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw new Error("Error fetching restaurant.");
      return data;
    },
    deliverers: async () => {
      const {data, error} = await supabase.from("deliverers").select("*");
      if (error) throw new Error("Error fetching deliverers.");
      return data;
    },
    deliverer: async (_, {id}) => {
      const {data, error} = await supabase
        .from("deliverers")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw new Error("Error fetching deliverer.");
      return data;
    },
    menuItems: async (_, {restaurantId}) => {
      const {data, error} = await supabase
        .from("menu_items")
        .select("*")
        .eq("restaurant_id", restaurantId);
      if (error) throw new Error("Error fetching menu items.");
      return data;
    },
    menuItem: async (_, {id}) => {
      const {data, error} = await supabase
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
      const {data, error} = await supabase
        .from("restaurants")
        .insert(args)
        .select()
        .single();
      if (error) throw new Error("Error adding restaurant.");
      return data;
    },
    createDeliverer: async (_, args) => {
      const {data, error} = await supabase
        .from("deliverers")
        .insert(args)
        .select()
        .single();
      if (error) throw new Error("Error adding deliverer.");
      return data;
    },
    updateDeliverer: async (_, {id, input}) => {
      const {data, error} = await supabase
        .from("deliverers")
        .update(input)
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error("Error updating deliverer.");
      return data;
    },
    deleteDeliverer: async (_, {id}) => {
      const {error} = await supabase
        .from("deliverers")
        .delete()
        .eq("id", id);
      if (error) throw new Error("Error deleting deliverer.");
      return true;
    },
    addMenuItem: async (_, {input}) => {
      const {data, error} = await supabase
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
    updateMenuItem: async (_, {id, input}) => {
      const {data, error} = await supabase
        .from("menu_items")
        .update({
          name: input.name,
          description: input.description,
          price: input.price,
          category: input.category,
          image_url: input.imageUrl,
          updated_at: new Date().toISOString()
        })
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
    deleteMenuItem: async (_, {id}) => {
      const {error} = await supabase
        .from("menu_items")
        .delete()
        .eq("id", id);
      if (error) throw new Error("Error deleting menu item.");
      return true;
    }
  }
};

// Setup ApolloServer for GraphQL
const graphqlServer = new ApolloServer({
  typeDefs,
  resolvers,
  context: ({req}) => {
    // Remove the strict token requirement for now
    return {};
  },
});

// Initialize GraphQL server
const initGraphQL = async () => {
  try {
    await graphqlServer.start();
    graphqlServer.applyMiddleware({app: router, path: "/graphql"});
    console.log("GraphQL server initialized successfully");
  } catch (error) {
    console.error("Error initializing GraphQL server:", error);
  }
};

// Call the initialization function
initGraphQL();

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

export default router;
