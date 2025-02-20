import bcrypt from "bcrypt";
import { validateEmail } from "./utils/validators.js";

const resolvers = {
  Query: {
    users: async (_, __, { supabase }) => {
      const { data, error } = await supabase.from("users").select("*");
      if (error) throw new Error(error.message);

      // Handle null phone numbers
      const sanitizedData = data.map((user) => ({
        ...user,
        name: user.name || "Not provided", // Fallback value
        phoneNumber: user.phone_number || "Not provided", // Fallback value
        createdAt: user.created_at || "Not provided", // Fallback value
        isVerified: user.is_verified,
        role: user.role || "Not provided", // Fallback value
      }));

      return sanitizedData;
    },
    user: async (_, { id }, { supabase }) => {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw new Error(error.message);
      return {
        ...data,
        name: data.name,
        phoneNumber: data.phone_number,
        role: data.role,
        isVerified: data.is_verified,
        createdAt: data.created_at,
      };
    },
    restaurants: async (_, __, { supabase }) => {
      const { data, error } = await supabase.from("restaurants").select("*");
      if (error) throw new Error(error.message);

      // Handle null phone numbers
      const sanitizedData = data.map((restaurant) => ({
        ...restaurant,
        phoneNumber: restaurant.phone_number || "Not provided", // Fallback value
        createdAt: restaurant.created_at || "Not provided", // Fallback value
        updatedAt: restaurant.updated_at || "Not provided", // Fallback value
        isActive: restaurant.is_active,
        openingHours: {
          monday: restaurant.opening_hours?.monday || {
            open: "09:00",
            close: "22:00",
          },
          tuesday: restaurant.opening_hours?.tuesday || {
            open: "09:00",
            close: "22:00",
          },
          wednesday: restaurant.opening_hours?.wednesday || {
            open: "09:00",
            close: "22:00",
          },
          thursday: restaurant.opening_hours?.thursday || {
            open: "09:00",
            close: "22:00",
          },
          friday: restaurant.opening_hours?.friday || {
            open: "09:00",
            close: "22:00",
          },
          saturday: restaurant.opening_hours?.saturday || {
            open: "09:00",
            close: "22:00",
          },
          sunday: restaurant.opening_hours?.sunday || {
            open: "09:00",
            close: "22:00",
          },
        },
        imageUrl: restaurant.image_url || "Not provided", // Fallback value
      }));

      return sanitizedData;
    },
    restaurant: async (_, { id }, { supabase }) => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw new Error(error.message);

      if (!data.opening_hours) {
        // Provide a default value for opening hours
        data.opening_hours = {
          monday: { open: "09:00", close: "17:00" },
          tuesday: { open: "09:00", close: "17:00" },
          wednesday: { open: "09:00", close: "17:00" },
          thursday: { open: "09:00", close: "17:00" },
          friday: { open: "09:00", close: "17:00" },
          saturday: { open: "10:00", close: "14:00" },
          sunday: { open: "Closed", close: "Closed" },
        };
      }
      return {
        ...data,
        openingHours: data.opening_hours,
        phoneNumber: data.phone_number || "Not provided",
        imageUrl: data.image_url || null,
        isActive: data.is_active,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    },
    searchRestaurants: async (_, { query }, { supabase }) => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("*")
        .or(`name.ilike.%${query}%,address.ilike.%${query}%`);
      if (error) throw new Error(error.message);
      return data;
    },
    menuItems: async (_, { restaurantId }, { supabase }) => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("*")
        .eq("restaurant_id", restaurantId);
      if (error) throw new Error(error.message);

      return data.map((menuItem) => ({
        ...menuItem,
        createdAt: menuItem.created_at || "Not provided",
        updatedAt: menuItem.updated_at || "Not provided",
        imageUrl: menuItem.image_url || null,
      }));
    },
    allMenuItems: async (_, __, { supabase }) => {
      const { data, error } = await supabase.from("menu_items").select("*");
      if (error) throw new Error(error.message);

      return data.map((menuItem) => ({
        ...menuItem,
        restaurantId: menuItem.restaurant_id,
        createdAt: menuItem.created_at || "Not provided",
        updatedAt: menuItem.updated_at || "Not provided",
        imageUrl: menuItem.image_url || null,
      }));
    },
    orders: async (_, { userId, restaurantId, status }, { supabase }) => {
      try {
        // Build the query with optional filters
        let query = supabase
          .from("orders")
          .select("*, order_items(menu_item_id, quantity, price)");

        if (userId) query = query.eq("user_id", userId);
        if (restaurantId) query = query.eq("restaurant_id", restaurantId);
        if (status) query = query.eq("status", status);

        // Fetch the orders
        const { data: orders, error } = await query;

        if (error) throw new Error(`Failed to fetch orders: ${error.message}`);
        if (!orders || orders.length === 0) throw new Error("No orders found");

        return orders.map((order) => ({
          id: order.id,
          restaurantId: order.restaurant_id,
          userId: order.user_id,
          items: order.order_items.map((item) => ({
            menuItemId: item.menu_item_id,
            quantity: item.quantity,
            price: item.price,
          })),
          totalAmount: order.total_amount,
          deliveryAddress: order.delivery_address,
          instructions: order.instructions,
          status: order.status,
          createdAt: order.created_at,
          updatedAt: order.updated_at,
        }));
      } catch (err) {
        console.error("Error fetching orders:", err.message);
        throw new Error(err.message);
      }
    },
    order: async (_, { id }, { supabase }) => {
      try {
        // Fetch the order by ID
        const { data: order, error } = await supabase
          .from("orders")
          .select("*, order_items(menu_item_id, quantity, price)")
          .eq("id", id)
          .single();

        if (error) throw new Error(`Failed to fetch order: ${error.message}`);
        if (!order) throw new Error("Order not found");

        return {
          id: order.id,
          restaurantId: order.restaurant_id,
          userId: order.user_id,
          items: order.order_items.map((item) => ({
            menuItemId: item.menu_item_id,
            quantity: item.quantity,
            price: item.price,
          })),
          totalAmount: order.total_amount,
          deliveryAddress: order.delivery_address,
          instructions: order.instructions,
          status: order.status,
        };
      } catch (err) {
        console.error("Error fetching order:", err.message);
        throw new Error(err.message);
      }
    },
  },
  Mutation: {
    createUser: async (_, { input }, { supabase }) => {
      const password = "123456789";
      const hashedPassword = await bcrypt.hash(password, 10);
      // Map GraphQL fields to Supabase fields
      const dbInput = {
        ...input,
        name: input.name,
        password: hashedPassword,
        phone_number: input.phoneNumber, // Use 'phone_number' (case-sensitive)
        is_verified: true,
        role: input.role,
      };
      // Remove the phoneNumber field to avoid duplication
      delete dbInput.phoneNumber;
      console.log("Input:", input);
      console.log("DB Input:", dbInput);

      // Check if the phone number already exists in the users table
      const { data: existingUser, error: existingUserError } = await supabase
        .from("users")
        .select("phone_number")
        .eq("phone_number", input.phoneNumber)
        .single();

      if (existingUser) {
        throw new Error("Ce numéro est déjà utilisé.");
      }

      if (existingUserError && existingUserError.code !== "PGRST116") {
        console.error("Erreur de vérification du numéro:", existingUserError);
        throw new Error("Erreur interne du serveur.");
      }

      const { data, error } = await supabase
        .from("users")
        .insert([dbInput])
        .select()
        .single();

      if (error) throw new Error(error.message);
      return {
        ...data,
        phoneNumber: data.phone_number, // Map phone_number back to phoneNumber
      };
    },
    createRestaurant: async (_, { input }, { supabase }) => {
      if (!validateEmail(input.email)) {
        throw new Error(`${input.email} n'est pas un adresse mail valide!`);
      }

      // Map GraphQL fields to Supabase fields
      const dbInput = {
        ...input,
        phone_number: input.phoneNumber,
        opening_hours: input.openingHours, // Map openingHours to opening_hours
        is_active: input.isActive, // Map isActive to is_active
        image_url: input.imageUrl, // Map isActive to is_active
      };

      delete dbInput.openingHours; // Remove GraphQL-only field
      delete dbInput.isActive; // Remove GraphQL-only field
      delete dbInput.phoneNumber; // Remove GraphQL-only field
      delete dbInput.imageUrl; // Remove GraphQL-only field

      const { data, error } = await supabase
        .from("restaurants")
        .insert([dbInput])
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },

    updateRestaurant: async (_, { id, input }, { supabase }) => {
      if (input.email && !validateEmail(input.email)) {
        throw new Error(`${input.email} n'est pas un adresse mail valide!`);
      }
      const { data, error } = await supabase
        .from("restaurants")
        .update(input)
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    deleteRestaurant: async (_, { id }, { supabase }) => {
      const { error } = await supabase
        .from("restaurants")
        .delete()
        .eq("id", id);
      if (error) throw new Error(error.message);
      return true;
    },
    addMenuItem: async (_, { input }, { supabase }) => {
      const dbInput = {
        ...input,
        restaurant_id: input.restaurantId, // Map restaurantId to restaurant_id
        image_url: input.imageUrl, // Map imageUrl to image_url
      };

      delete dbInput.restaurantId; // Remove GraphQL-only field
      delete dbInput.imageUrl; // Remove GraphQL-only field

      const { data, error } = await supabase
        .from("menu_items")
        .insert([dbInput])
        .select()
        .single();

      if (error) throw new Error(error.message);
      return {
        ...data,
        imageUrl: data.image_url || "Not provided", // Fallback value
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    },
    updateMenuItem: async (_, { id, input }, { supabase }) => {
      const { data, error } = await supabase
        .from("menu_items")
        .update(input)
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    createOrder: async (_, { input }, { supabase }) => {
      try {
        const { data: menuItems, error: fetchError } = await supabase
          .from("menu_items")
          .select("id, price")
          .in(
            "id",
            input.items.map((item) => item.menuItemId)
          );

        if (fetchError)
          throw new Error(`Failed to fetch menu items: ${fetchError.message}`);

        const priceMap = Object.fromEntries(
          menuItems.map((item) => [item.id, item.price])
        );
        const totalAmount = input.items.reduce((total, item) => {
          const itemPrice = priceMap[item.menuItemId];
          if (!itemPrice)
            throw new Error(`Menu item not found: ${item.menuItemId}`);
          return total + itemPrice * item.quantity;
        }, 0);

        const { data: newOrder, error: orderError } = await supabase
          .from("orders")
          .insert([
            {
              user_id: input.userId,
              restaurant_id: input.restaurantId,
              delivery_address: input.deliveryAddress,
              instructions: input.instructions || null,
              total_amount: totalAmount,
              status: "Pending",
            },
          ])
          .select()
          .single();

        if (orderError)
          throw new Error(`Failed to create order: ${orderError.message}`);

        const orderItems = input.items.map((item) => ({
          order_id: newOrder.id,
          menu_item_id: item.menuItemId,
          quantity: item.quantity,
          price: priceMap[item.menuItemId],
        }));

        const { error: itemsError } = await supabase
          .from("order_items")
          .insert(orderItems);
        if (itemsError)
          throw new Error(
            `Failed to create order items: ${itemsError.message}`
          );

        return {
          id: newOrder.id,
          restaurantId: newOrder.restaurant_id,
          userId: newOrder.user_id,
          items: input.items,
          totalAmount: newOrder.total_amount,
          deliveryAddress: newOrder.delivery_address,
          instructions: newOrder.instructions,
        };
      } catch (err) {
        console.error("Error in createOrder function:", err.message);
        throw new Error(err.message);
      }
    },
    updateOrderStatus: async (_, { id, status }, { supabase }) => {
      const { data, error } = await supabase
        .from("orders")
        .update({ status: status })
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
  },
};

export default resolvers;
