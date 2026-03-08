import bcrypt from "bcrypt";
import { validateEmail } from "./utils/validators.js";
import { Expo } from 'expo-server-sdk';

const expo = new Expo();

async function sendPushNotification(userId, title, messageText, data = {}, supabase) {
  // 1. Get the user's saved push token from Supabase
  const { data: tokens, error } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('user_id', userId);

  if (error || !tokens || tokens.length === 0) {
    console.warn('No push token found for user');
    return;
  }

  // 2. Create the message(s) with Android-specific configuration
  const messages = tokens.map(({ token }) => ({
    to: token,
    sound: 'default',
    title: title,
    body: messageText,
    data: data,
    // Android-specific configuration for background notifications
    priority: 'high',
    channelId: 'default',
    // These fields ensure the notification is displayed even when app is killed
    android: {
      sound: 'default',
      priority: 'max',
      channelId: 'default',
      vibrate: [0, 250, 250, 250],
      color: '#DB607E',
    },
    // iOS-specific configuration
    ios: {
      sound: 'default',
    },
  }));

  // 3. Send messages using Expo SDK
  const chunks = expo.chunkPushNotifications(messages);

  for (const chunk of chunks) {
    try {
      const receipts = await expo.sendPushNotificationsAsync(chunk);
      
    } catch (err) {
      console.error('Error sending push:', err);
    }
  }
}

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Helper function to transform restaurant data
const transformRestaurantData = (restaurant) => {
  // cPanel PostgreSQL may return JSONB columns as strings - parse them if needed
  let openingHours = restaurant.opening_hours;
  if (typeof openingHours === 'string') {
    try { openingHours = JSON.parse(openingHours); } catch { openingHours = null; }
  }

  return {
    ...restaurant,
    phoneNumber: restaurant.phone_number,
    imageUrl: restaurant.image_url,
    isActive: restaurant.is_active,
    createdAt: restaurant.created_at,
    updatedAt: restaurant.updated_at,
    distance: restaurant.distance,
    openingHours: {
      monday: openingHours?.monday || { open: "09:00", close: "22:00" },
      tuesday: openingHours?.tuesday || { open: "09:00", close: "22:00" },
      wednesday: openingHours?.wednesday || { open: "09:00", close: "22:00" },
      thursday: openingHours?.thursday || { open: "09:00", close: "22:00" },
      friday: openingHours?.friday || { open: "09:00", close: "22:00" },
      saturday: openingHours?.saturday || { open: "09:00", close: "22:00" },
      sunday: openingHours?.sunday || { open: "09:00", close: "22:00" },
    },
  };
};

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
    user: async (_, { id, phoneNumber }, { supabase }) => {
      let query = supabase.from("users").select("*");

      if (id) {
        query = query.eq("id", id);
      } else if (phoneNumber) {
        query = query.eq("phone_number", phoneNumber);
      } else {
        throw new Error("Either id or phoneNumber must be provided");
      }

      const { data, error } = await query.single();
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
    deliverer: async (_, { userId }, { supabase }) => {
      const { data, error } = await supabase
        .from("deliverers")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (error) throw new Error(error.message);

      return {
        ...data,
        userId: data.user_id,
        vehicleId: data.vehicle_id,
        isAvailable: data.is_available,
        currentLocation: typeof data.current_location === 'string' ? JSON.parse(data.current_location) : data.current_location,
        zone: data.zone,
        profilePicture: data.profile_picture,
        isActive: data.is_active,
        isVerified: data.is_verified,
      };
    },
    allDeliverers: async (_, __, { supabase }) => {
      const { data, error } = await supabase
        .from("deliverers")
        .select("*");

      if (error) throw new Error(error.message);

      return data.map((d) => ({
        ...d,
        userId: d.user_id,
        vehicleId: d.vehicle_id,
        isAvailable: d.is_available,
        currentLocation: typeof d.current_location === 'string' ? JSON.parse(d.current_location) : d.current_location,
        zone: d.zone,
        profilePicture: d.profile_picture,
        isActive: d.is_active,
        isVerified: d.is_verified,
      }));
    },

    restaurants: async (_, __, { supabase }) => {
      try {
        // First get all restaurants
        const { data: restaurants, error } = await supabase
          .from("restaurants")
          .select("*");

        if (error) throw new Error(error.message);

        if (!restaurants || restaurants.length === 0) return [];

        // Fetch all completed orders with ratings and notes for all restaurants
        const { data: orders, error: ordersError } = await supabase
          .from("orders")
          .select("id, rating, note, user_id, restaurant_id, created_at")
          .eq("status", "COMPLETED");

        if (ordersError) {
          console.error("Error fetching orders for restaurants:", ordersError.message);
          // Continue without order data rather than crashing
        }

        // Fetch all users for feedbacks - guard against empty array
        const userIds = [...new Set((orders || []).map(order => order.user_id).filter(Boolean))];
        let userMap = {};
        if (userIds.length > 0) {
          const { data: users, error: usersError } = await supabase
            .from("users")
            .select("id, name")
            .in("id", userIds);

          if (!usersError && users) {
            users.forEach(user => {
              userMap[user.id] = user.name;
            });
          }
        }

        // Calculate average ratings for each restaurant
        const restaurantsWithRatings = (restaurants || []).map(restaurant => {
          // Filter for completed orders with ratings for this restaurant
          const restaurantOrders = (orders || []).filter(o => o.restaurant_id === restaurant.id);
          const validRatings = restaurantOrders
            .filter(order => order.rating !== null)
            .map(order => order.rating);

          const averageRating = validRatings.length > 0
            ? validRatings.reduce((sum, rating) => sum + rating, 0) / validRatings.length
            : null;

          // Parse opening_hours if returned as string (plain PostgreSQL vs Supabase)
          let oh = restaurant.opening_hours;
          if (typeof oh === 'string') { try { oh = JSON.parse(oh); } catch { oh = null; } }

          return {
            ...restaurant,
            phoneNumber: restaurant.phone_number || "Not provided",
            createdAt: restaurant.created_at || "Not provided",
            updatedAt: restaurant.updated_at || "Not provided",
            isActive: restaurant.is_active,
            rating: averageRating,
            totalRatings: validRatings.length,
            openingHours: {
              monday: oh?.monday || { open: "09:00", close: "22:00" },
              tuesday: oh?.tuesday || { open: "09:00", close: "22:00" },
              wednesday: oh?.wednesday || { open: "09:00", close: "22:00" },
              thursday: oh?.thursday || { open: "09:00", close: "22:00" },
              friday: oh?.friday || { open: "09:00", close: "22:00" },
              saturday: oh?.saturday || { open: "09:00", close: "22:00" },
              sunday: oh?.sunday || { open: "09:00", close: "22:00" },
            },
            imageUrl: restaurant.image_url || "Not provided",
          };
        });

        // Sort restaurants by rating (null ratings will be at the end)
        return restaurantsWithRatings.sort((a, b) => {
          if (a.rating === null && b.rating === null) return 0;
          if (a.rating === null) return 1;
          if (b.rating === null) return -1;
          return b.rating - a.rating;
        });
      } catch (err) {
        console.error("Error in restaurants query:", err);
        return []; // Return empty array instead of throwing, so other query fields still work
      }
    },
    restaurant: async (_, { id }, { supabase }) => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw new Error(error.message);

      // Fetch all completed orders with ratings and notes for this restaurant
      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select("id, rating, note, user_id, created_at")
        .eq("restaurant_id", id)
        .eq("status", "COMPLETED")
        .not("rating", "is", null);

      if (ordersError) throw new Error(ordersError.message);

      const userIds = [...new Set(orders.map(order => order.user_id))];
      const { data: users, error: usersError } = await supabase
        .from("users")
        .select("id, name")
        .in("id", userIds);

      const userMap = {};
      (users || []).forEach(user => {
        userMap[user.id] = user.name;
      });

      const ratings = orders.map(order => order.rating).filter(r => r !== null && r !== undefined);

      const averageRating = ratings.length > 0
        ? (ratings.reduce((sum, r) => sum + r, 0) / ratings.length)
        : null;

      // Collect feedbacks (notes)
      const feedbacks = orders
        .filter(order => order.note && order.note.trim() !== "")
        .map(order => ({
          note: order.note,
          userId: order.user_id,
          rating: order.rating,
          userName: userMap[order.user_id] || "Utilisateur inconnu",
          createdAt: order.created_at
        }));

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
        averageRating,
        feedbacks,
        openingHours: data.opening_hours,
        phoneNumber: data.phone_number || "Not provided",
        imageUrl: data.image_url || null,
        isActive: data.is_active,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    },

    restaurantsNearby: async (_, { latitude, longitude, maxDistance = 10.0 }, { supabase }) => {
      try {
        // Get all restaurants with coordinates
        const { data: allRestaurants, error } = await supabase
          .from("restaurants")
          .select("*")
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)
          .eq('is_active', true);

        if (error) {
          console.error('Error fetching restaurants:', error);
          return [];
        }

        if (!allRestaurants || allRestaurants.length === 0) {
          
          return [];
        }

        // Calculate distances and filter
        const restaurantsWithDistance = allRestaurants
          .map(restaurant => {
            const distance = calculateDistance(latitude, longitude, restaurant.latitude, restaurant.longitude);
            return { ...restaurant, distance };
          })
          .filter(restaurant => restaurant.distance <= maxDistance)
          .sort((a, b) => a.distance - b.distance);

        

        // Get all restaurant IDs
        const restaurantIds = restaurantsWithDistance.map(r => r.id);

        // Fetch all completed orders with ratings and notes for these restaurants
        const { data: orders, error: ordersError } = await supabase
          .from("orders")
          .select("id, rating, note, user_id, restaurant_id, created_at")
          .in("restaurant_id", restaurantIds)
          .eq("status", "COMPLETED");

        if (ordersError) {
          console.error('Error fetching orders:', ordersError);
          // Continue without orders data
        }

        // Fetch all users for feedbacks
        const userIds = [...new Set((orders || []).map(order => order.user_id))];
        let userMap = {};
        if (userIds.length > 0) {
          const { data: users, error: usersError } = await supabase
            .from("users")
            .select("id, name")
            .in("id", userIds);

          if (!usersError && users) {
            users.forEach(user => {
              userMap[user.id] = user.name;
            });
          }
        }

        // Transform each restaurant with averageRating and feedbacks
        return restaurantsWithDistance.map(restaurant => {
          const restaurantOrders = (orders || []).filter(order => order.restaurant_id === restaurant.id);

          // Calculate average rating
          const ratings = restaurantOrders.map(order => order.rating).filter(r => r !== null && r !== undefined);
          const averageRating = ratings.length > 0
            ? (ratings.reduce((sum, r) => sum + r, 0) / ratings.length)
            : null;

          // Collect feedbacks (notes)
          const feedbacks = restaurantOrders
            .filter(order => order.note && order.note.trim() !== "")
            .map(order => ({
              note: order.note,
              userId: order.user_id,
              rating: order.rating,
              userName: userMap[order.user_id] || "Utilisateur inconnu",
              createdAt: order.created_at
            }));

          return {
            ...transformRestaurantData(restaurant),
            averageRating: (averageRating === null ? 0 : averageRating),
            feedbacks
          };
        });

      } catch (error) {
        console.error('Error in restaurantsNearby:', error);
        // Return empty array instead of null to satisfy GraphQL non-null constraint
        return [];
      }
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
      try {
        const { data, error } = await supabase.from("menu_items").select("*");
        if (error) throw new Error(error.message);

        return (data || []).map((menuItem) => ({
          ...menuItem,
          restaurantId: menuItem.restaurant_id,
          createdAt: menuItem.created_at || "Not provided",
          updatedAt: menuItem.updated_at || "Not provided",
          imageUrl: menuItem.image_url || null,
          category: menuItem.category || "Non classifié",
          isAvailable: menuItem.is_available !== undefined ? menuItem.is_available : true,
        }));
      } catch (err) {
        console.error("Error in allMenuItems:", err);
        return [];
      }
    },
    menuItem: async (_, { id }, { supabase }) => {
      try {
        

        const { data, error } = await supabase
          .from("menu_items")
          .select("*")
          .eq("id", id)
          .single();

        if (error) {
          console.error(`Error fetching menu item: ${error.message}`);
          throw new Error(error.message);
        }

        if (!data) {
          console.error(`Menu item with id ${id} not found`);
          throw new Error(`Menu item with id ${id} not found`);
        }

        

        return {
          ...data,
          id: data.id,
          restaurantId: data.restaurant_id,
          createdAt: data.created_at || "Not provided",
          updatedAt: data.updated_at || "Not provided",
          imageUrl: data.image_url || null,
          isAvailable: data.is_available || true,
        };
      } catch (error) {
        console.error(`Error in menuItem resolver: ${error.message}`);
        throw new Error(`Error fetching menu item: ${error.message}`);
      }
    },
    orders: async (_, { userId, restaurantId, status, delivererId }, { supabase }) => {
      try {
        let query = supabase
          .from("orders")
          .select("*")
          .order("created_at", { ascending: false });

        if (userId) query = query.eq("user_id", userId);
        if (restaurantId) query = query.eq("restaurant_id", restaurantId);
        if (status) query = query.eq("status", status);
        if (delivererId) query = query.eq("deliverer_id", delivererId);

        const { data: orders, error } = await query;

        if (error) throw new Error(`Failed to fetch orders: ${error.message}`);

        if (!orders || orders.length === 0) return [];

        // Fetch related data
        const orderIds = orders.map(o => o.id);
        const userIds = [...new Set(orders.map(o => o.user_id))].filter(Boolean);
        const restIds = [...new Set(orders.map(o => o.restaurant_id))].filter(Boolean);
        const delivIds = [...new Set(orders.map(o => o.deliverer_id))].filter(Boolean);

        // Fetch order items with menu items
        const { data: orderItems, error: itemsError } = await supabase
          .from("order_items")
          .select("*")
          .in("order_id", orderIds);

        const menuItemIds = [...new Set((orderItems || []).map(oi => oi.menu_item_id))].filter(Boolean);
        const { data: menuItems, error: menuErr } = await supabase
          .from("menu_items")
          .select("*")
          .in("id", menuItemIds);

        // Fetch users
        const { data: users, error: usersError } = await supabase
          .from("users")
          .select("id, name, phone_number")
          .in("id", userIds);

        // Fetch restaurants
        const { data: restaurants, error: restError } = await supabase
          .from("restaurants")
          .select("*")
          .in("id", restIds);

        // Fetch deliverers
        const { data: deliverers, error: delivError } = await supabase
          .from("deliverers")
          .select("*")
          .in("user_id", delivIds);

        // Fetch deliverer users
        const { data: delivUsers, error: delivUsersError } = await supabase
          .from("users")
          .select("id, name, phone_number")
          .in("id", delivIds);

        // Create lookup maps
        const userMap = Object.fromEntries((users || []).map(u => [u.id, u]));
        const restMap = Object.fromEntries((restaurants || []).map(r => [r.id, r]));
        const delivMap = Object.fromEntries((deliverers || []).map(d => [d.user_id, d]));
        const delivUserMap = Object.fromEntries((delivUsers || []).map(u => [u.id, u]));
        const menuMap = Object.fromEntries((menuItems || []).map(m => [m.id, m]));
        const itemsMap = {};
        (orderItems || []).forEach(item => {
          if (!itemsMap[item.order_id]) itemsMap[item.order_id] = [];
          itemsMap[item.order_id].push({
            ...item,
            menuItem: menuMap[item.menu_item_id]
          });
        });

        return orders.map((order) => {
          const delivererData = delivMap[order.deliverer_id];
          const delivererUser = delivUserMap[order.deliverer_id];
          
          let deliverer = null;
          if (delivererData) {
            deliverer = {
              userId: delivererData.user_id,
              user_id: delivererData.user_id,
              user: delivererUser ? {
                id: delivererUser.id,
                name: delivererUser.name,
                phoneNumber: delivererUser.phone_number
              } : null,
              vehicleId: delivererData.vehicle_id,
              isAvailable: delivererData.is_available,
              currentLocation: typeof delivererData.current_location === "string"
                ? JSON.parse(delivererData.current_location)
                : delivererData.current_location,
              zone: delivererData.zone,
              profilePicture: delivererData.profile_picture,
              isActive: delivererData.is_active,
              isVerified: delivererData.is_verified
            };
          }

          const user = userMap[order.user_id];
          const restaurant = restMap[order.restaurant_id];

          return {
            id: order.id,
            restaurantId: order.restaurant_id,
            userId: order.user_id,
            user: user ? {
              id: user.id,
              name: user.name,
              phoneNumber: user.phone_number
            } : null,
            restaurant: restaurant ? {
              id: restaurant.id,
              name: restaurant.name,
              description: restaurant.description,
              phoneNumber: restaurant.phone_number,
              address: restaurant.address,
              latitude: restaurant.latitude,
              longitude: restaurant.longitude
            } : null,
            items: (itemsMap[order.id] || []).map((item) => ({
              menuItemId: item.menu_item_id,
              menuItem: item.menuItem ? {
                id: item.menuItem.id,
                name: item.menuItem.name,
                description: item.menuItem.description,
                price: item.menuItem.price,
                imageUrl: item.menuItem.image_url || null
              } : null,
              quantity: item.quantity,
              price: item.price
            })),
            totalAmount: order.total_amount,
            deliveryAddress: order.delivery_address,
            instructions: order.instructions,
            status: order.status,
            isPaid: order.is_paid || false,
            paymentMethod: order.payment_method || "CASH",
            createdAt: order.created_at || null,
            updatedAt: order.updated_at || null,
            delivererId: order.deliverer_id,
            deliverer
          };
        });
      } catch (err) {
        console.error("Error fetching orders:", err.message);
        throw new Error(err.message);
      }
    },
    order: async (_, { id }, { supabase }) => {
      try {
        const { data: order, error } = await supabase
          .from("orders")
          .select("*")
          .eq("id", id)
          .single();

        if (error) throw new Error(`Failed to fetch order: ${error.message}`);
        if (!order) throw new Error("Order not found");

        // Fetch related data
        const [itemsResult, userResult, restResult, delivResult] = await Promise.all([
          supabase.from("order_items").select("*").eq("order_id", id),
          supabase.from("users").select("id, name, phone_number").eq("id", order.user_id).single(),
          supabase.from("restaurants").select("*").eq("id", order.restaurant_id).single(),
          order.deliverer_id ? supabase.from("deliverers").select("*").eq("user_id", order.deliverer_id).single() : Promise.resolve({ data: null }),
        ]);

        const orderItems = itemsResult.data || [];
        const userRow = userResult.data;
        const restaurantRow = restResult.data;
        const delivererData = delivResult.data;

        // Fetch menu items for the order items
        const menuItemIds = [...new Set(orderItems.map(oi => oi.menu_item_id))].filter(Boolean);
        const { data: menuItems } = await supabase.from("menu_items").select("*").in("id", menuItemIds);
        const menuMap = Object.fromEntries((menuItems || []).map(m => [m.id, m]));

        // Fetch deliverer user if needed
        let delivererUser = null;
        if (delivererData) {
          const { data } = await supabase.from("users").select("id, name, phone_number").eq("id", delivererData.user_id).single();
          delivererUser = data;
        }

        let deliverer = null;
        if (delivererData) {
          deliverer = {
            userId: delivererData.user_id,
            user: delivererUser ? {
              id: delivererUser.id,
              name: delivererUser.name,
              phoneNumber: delivererUser.phone_number
            } : null,
            vehicleId: delivererData.vehicle_id,
            isAvailable: delivererData.is_available,
            currentLocation: typeof delivererData.current_location === "string"
              ? JSON.parse(delivererData.current_location)
              : delivererData.current_location,
            zone: delivererData.zone,
            profilePicture: delivererData.profile_picture,
            isActive: delivererData.is_active,
            isVerified: delivererData.is_verified
          };
        }

        return {
          id: order.id,
          restaurantId: order.restaurant_id,
          userId: order.user_id,
          user: userRow ? {
            id: userRow.id,
            name: userRow.name,
            phoneNumber: userRow.phone_number
          } : null,
          restaurant: restaurantRow ? {
            id: restaurantRow.id,
            name: restaurantRow.name,
            description: restaurantRow.description,
            phoneNumber: restaurantRow.phone_number,
            address: restaurantRow.address
          } : null,
          items: orderItems.map((item) => {
            const mi = menuMap[item.menu_item_id];
            return {
              menuItemId: item.menu_item_id,
              menuItem: mi ? {
                id: mi.id,
                name: mi.name,
                description: mi.description,
                price: mi.price,
                imageUrl: mi.image_url || null
              } : null,
              quantity: item.quantity,
              price: item.price
            };
          }),
          totalAmount: order.total_amount,
          deliveryAddress: order.delivery_address,
          instructions: order.instructions,
          status: order.status,
          isPaid: order.is_paid || false,
          paymentMethod: order.payment_method || "CASH",
          createdAt: order.created_at || null,
          updatedAt: order.updated_at || null,
          delivererId: order.deliverer_id,
          deliverer
        };
      } catch (err) {
        console.error("Error fetching order:", err.message);
        throw new Error(err.message);
      }
    },

    restaurantByEmail: async (_, { email }, { supabase }) => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("*")
        .eq("email", email)
        .single();
      if (error) throw new Error("Restaurant not found.");
      return data;
    },
    notifications: async (_, { userId }, { supabase }) => {
      try {
        const { data, error } = await supabase
          .from("notifications")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });

        if (error) throw new Error(`Error fetching notifications: ${error.message}`);

        // Transform data to match GraphQL schema
        return (data || []).map(notification => ({
          id: notification.id,
          userId: notification.user_id,
          title: notification.title,
          body: notification.body,
          read: notification.read || false,
          createdAt: notification.created_at
        }));
      } catch (err) {
        console.error("Error in notifications query:", err);
        throw new Error(err.message);
      }
    },

    payoutItems: async ({ id }, _, { supabase }) => {
      try {
        const { data } = await supabase
          .from("payout_batch_items")
          .select("*")
          .eq("order_id", id)
          .order("created_at", { ascending: false });

        return data.map(x => ({
          id: x.id,
          batchId: x.batch_id,
          payoutId: x.payout_id,
          targetType: x.target_type,
          targetId: x.target_id,
          receiveAmount: x.receive_amount,
          fee: x.fee,
          status: x.status,
          errorCode: x.error_code,
          errorMessage: x.error_message,
          createdAt: x.created_at
        }));
      } catch (error) {
        console.error("Error in payoutItems query:", error);
        throw new Error(error.message);
      }
    },
    payoutStatus: async ({ id }, _, { supabase }) => {
      try {
        const { data } = await supabase
          .from("payout_batch_items")
          .select("status")
          .eq("order_id", id);

        if (!data.length) return "pending";
        if (data.every(p => p.status === "succeeded")) return "succeeded";
        if (data.some(p => p.status === "failed")) return "partial";
        return "processing";
      } catch (err) {
        console.error("Error in payoutItems query:", err);
        throw new Error(err.message);
      }
    },
    restaurantRatings: async (_, { restaurantId }, { supabase }) => {
      try {
        const { data: ratings, error } = await supabase
          .from('restaurant_ratings')
          .select('*')
          .eq('restaurant_id', restaurantId)
          .order('created_at', { ascending: false });

        if (error) throw new Error(`Error fetching ratings: ${error.message}`);

        if (!ratings || ratings.length === 0) return [];

        const userIds = [...new Set(ratings.map(r => r.user_id))].filter(Boolean);
        const { data: users } = await supabase
          .from('users')
          .select('id, name, phone_number')
          .in('id', userIds);
        
        const userMap = Object.fromEntries((users || []).map(u => [u.id, u]));

        return ratings.map(rating => {
          const user = userMap[rating.user_id];
          return {
            id: rating.id,
            restaurantId: rating.restaurant_id,
            userId: rating.user_id,
            user: user ? {
              id: user.id,
              name: user.name,
              phoneNumber: user.phone_number
            } : null,
            rating: rating.rating,
            comment: rating.comment,
            createdAt: rating.created_at,
            updatedAt: rating.updated_at
          };
        });
      } catch (err) {
        console.error("Error in restaurantRatings query:", err);
        throw new Error(err.message);
      }
    },

    userRestaurantRating: async (_, { restaurantId, userId }, { supabase }) => {
      try {
        const { data, error } = await supabase
          .from('restaurant_ratings')
          .select('*')
          .eq('restaurant_id', restaurantId)
          .eq('user_id', userId)
          .single();

        if (error && error.code !== 'PGRST116') throw new Error(`Error fetching rating: ${error.message}`);
        if (!data) return null;

        return {
          id: data.id,
          restaurantId: data.restaurant_id,
          userId: data.user_id,
          rating: data.rating,
          comment: data.comment,
          createdAt: data.created_at,
          updatedAt: data.updated_at
        };
      } catch (err) {
        console.error("Error in userRestaurantRating query:", err);
        throw new Error(err.message);
      }
    },

    delivererStats: async (_, { delivererId }, { supabase }) => {
      try {
        // Get today's date range (start and end of day)
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
        const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

        // Fetch all completed orders for this deliverer
        const { data: allOrders, error: allError } = await supabase
          .from('orders')
          .select('deliverer_payout, created_at')
          .eq('deliverer_id', delivererId)
          .eq('status', 'COMPLETED');

        if (allError) {
          console.error('Error fetching all orders:', allError);
          throw new Error(`Error fetching orders: ${allError.message}`);
        }

        // Fetch today's completed orders for this deliverer
        const { data: todayOrders, error: todayError } = await supabase
          .from('orders')
          .select('deliverer_payout')
          .eq('deliverer_id', delivererId)
          .eq('status', 'COMPLETED')
          .gte('created_at', startOfDay.toISOString())
          .lte('created_at', endOfDay.toISOString());

        if (todayError) {
          console.error('Error fetching today orders:', todayError);
          throw new Error(`Error fetching today's orders: ${todayError.message}`);
        }

        // Calculate totals
        const totalEarnings = (allOrders || []).reduce((sum, order) => sum + (order.deliverer_payout || 0), 0);
        const totalDeliveries = (allOrders || []).length;

        const todayEarnings = (todayOrders || []).reduce((sum, order) => sum + (order.deliverer_payout || 0), 0);
        const todayDeliveries = (todayOrders || []).length;

        return {
          todayEarnings,
          todayDeliveries,
          totalEarnings,
          totalDeliveries
        };
      } catch (err) {
        console.error('Error in delivererStats query:', err);
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

      // Map GraphQL fields to Supabase fields
      const dbInput = {};

      // Only include fields that are provided in the input
      if (input.name) dbInput.name = input.name;
      if (input.description) dbInput.description = input.description;
      if (input.address) dbInput.address = input.address;
      if (input.type) dbInput.type = input.type;
      if (input.email) dbInput.email = input.email;
      if (input.latitude !== undefined) dbInput.latitude = input.latitude;
      if (input.longitude !== undefined) dbInput.longitude = input.longitude;

      // Map camelCase to snake_case
      if (input.phoneNumber) dbInput.phone_number = input.phoneNumber;
      if (input.imageUrl) dbInput.image_url = input.imageUrl;
      if (input.isActive !== undefined) dbInput.is_active = input.isActive;
      if (input.openingHours) dbInput.opening_hours = input.openingHours;

      const { data, error } = await supabase
        .from("restaurants")
        .update(dbInput)
        .eq("id", id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    deleteRestaurant: async (_, { id }, { supabase }) => {
      const { error } = await supabase.from("restaurants").delete().eq("id", id);
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
      try {
        

        // Map GraphQL fields to database column names
        const dbInput = {};

        if (input.name !== undefined) dbInput.name = input.name;
        if (input.description !== undefined) dbInput.description = input.description;
        if (input.price !== undefined) dbInput.price = input.price;
        if (input.category !== undefined) dbInput.category = input.category;
        if (input.isAvailable !== undefined) dbInput.is_available = input.isAvailable;

        // Map imageUrl to image_url
        if (input.imageUrl !== undefined) dbInput.image_url = input.imageUrl;

        

        const { data, error } = await supabase
          .from("menu_items")
          .update(dbInput)
          .eq("id", id)
          .select()
          .single();

        if (error) {
          console.error(`Error updating menu item: ${error.message}`);
          throw new Error(error.message);
        }

        

        return {
          ...data,
          id: data.id,
          restaurantId: data.restaurant_id,
          imageUrl: data.image_url,
          isAvailable: data.is_available,
          createdAt: data.created_at,
          updatedAt: data.updated_at
        };
      } catch (error) {
        console.error(`Error in updateMenuItem: ${error.message}`);
        throw new Error(`Failed to update menu item: ${error.message}`);
      }
    },
    deleteMenuItem: async (_, { id }, { supabase }) => {
      try {
        

        const { error } = await supabase.from("menu_items").delete().eq("id", id);

        if (error) {
          console.error(`Error deleting menu item: ${error.message}`);
          throw new Error(error.message);
        }

        
        return true;
      } catch (error) {
        console.error(`Error in deleteMenuItem: ${error.message}`);
        throw new Error(`Failed to delete menu item: ${error.message}`);
      }
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
              total_amount: input.totalAmount,
              status: input.status || "Pending",
              is_paid: input.isPaid || false,
              payment_method: input.paymentMethod || "CASH",
              deliverer_id: input.delivererId || null,
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

        // 4. Appeler la fonction compute_order_from_total
        const { data: computed, error: computeErr } = await supabase.rpc(
          "compute_order_from_total",
          { p_order_id: newOrder.id }
        );

        // Notify customer that order was created
        await supabase.from('notifications').insert({
          user_id: newOrder.user_id,
          title: 'Commande créée',
          body: `Votre commande #${newOrder.id} a été créée avec succès!`,
        });

        await sendPushNotification(
          newOrder.user_id,
          'Commande créée',
          `Votre commande #${newOrder.id} a été créée avec succès! 🎉`,
          { type: 'ORDER_CREATED', orderId: newOrder.id, screen: 'OrderTracking' },
          supabase
        );

        // Notify assigned deliverer if present
        if (newOrder.deliverer_id) {
          // Insert into notifications table
          await supabase.from('notifications').insert({
            user_id: newOrder.deliverer_id,
            title: 'Nouvelle commande assignée',
            body: `Une commande #${newOrder.id} vous a été assignée.`,
          });

          // Send push notification
          await sendPushNotification(
            newOrder.deliverer_id,
            'Nouvelle commande assignée',
            `Une nouvelle commande #${newOrder.id} vous a été assignée.`,
            { type: 'NEW_ORDER', orderId: newOrder.id, screen: 'OrderDetails' },
            supabase
          );
        }

        return {
          id: newOrder.id,
          restaurantId: newOrder.restaurant_id,
          userId: newOrder.user_id,
          items: input.items,
          totalAmount: newOrder.total_amount,
          deliveryAddress: newOrder.delivery_address,
          instructions: newOrder.instructions,
          status: newOrder.status,
          isPaid: newOrder.is_paid || false,
          paymentMethod: newOrder.payment_method || "CASH",
          delivererID: newOrder.deliverer_id,
        };
      } catch (err) {
        console.error("Error in createOrder function:", err.message);
        throw new Error(err.message);
      }
    },
    updateOrderStatus: async (_, { id, status }, { supabase }) => {
      const { data: order, error } = await supabase
        .from("orders")
        .update({ status: status })
        .eq("id", id)
        .select()
        .single();

      if (error) throw new Error(error.message);

      // Create notification for the user
      if (order && order.user_id) {
        // Translate status to French
        let statusFrench;
        switch (status) {
          case 'PREPARING':
            statusFrench = 'en cours de préparation';
            break;
          case 'READY':
            statusFrench = 'prête à être récupérée';
            break;
          case 'DELIVERING':
            statusFrench = 'en cours de livraison';
            break;
          case 'COMPLETED':
            statusFrench = 'livrée';
            break;
          case 'CANCELLED':
            statusFrench = 'annulée';
            break;
          default:
            statusFrench = 'mise à jour';
        }

        if (order.deliverer_id) {
          let delivererMessage;

          switch (status) {
            case 'PREPARING':
              delivererMessage = `La commande #${order.id} est en préparation.`;
              break;
            case 'READY':
              delivererMessage = `La commande #${order.id} est prête. Veuillez la récupérer.`;
              break;
            case 'DELIVERING':
              delivererMessage = `Vous êtes en cours de livraison pour la commande #${order.id}.`;
              break;
            case 'COMPLETED':
              delivererMessage = `La commande #${order.id} a été livrée avec succès.`;
              break;
            case 'CANCELLED':
              delivererMessage = `La commande #${order.id} a été annulée.`;
              break;
            default:
              delivererMessage = `La commande #${order.id} a été mise à jour.`;
          }

          await supabase.from('notifications').insert({
            user_id: order.deliverer_id,
            title: 'Mise à jour de commande',
            body: delivererMessage,
          });

          await sendPushNotification(order.deliverer_id, 'Mise à jour de commande', delivererMessage, { type: 'DELIVERER_ORDER_UPDATE', orderId: order.id, screen: 'OrderDetails' }, supabase);
        }

        // Insert notification in French
        await supabase.from('notifications').insert({
          user_id: order.user_id,
          title: 'Mise à jour de commande',
          body: `Votre commande #${order.id} est maintenant ${statusFrench}`,
        });

        await sendPushNotification(order.user_id, 'Mise à jour de commande', `Votre commande est maintenant ${statusFrench}`, { type: 'ORDER_UPDATE', orderId: order.id, screen: 'OrderTracking' }, supabase);
      }

      return order;
    },

    confirmOrderDelivery: async (_, { orderId, token, delivererId }, { supabase }) => {
      // Step 1: Fetch the order
      const { data: order, error: fetchError } = await supabase
        .from("orders")
        .select("id, delivery_token, status, user_id")
        .eq("id", orderId)
        .single();

      if (fetchError || !order) throw new Error("Commande introuvable.");

      if (order.status === "COMPLETED") {
        throw new Error("Commande déjà livrée.");
      }

      // Step 2: Validate token
      if (order.delivery_token !== token) {
        throw new Error("Code de confirmation invalide.");
      }

      // Step 3: Update order status
      const { data: updated, error: updateError } = await supabase
        .from("orders")
        .update({
          status: "COMPLETED",
          delivered_by: delivererId,
          delivered_at: new Date().toISOString(),
          delivery_confirmation_method: "qr",
        })
        .eq("id", orderId)
        .select()
        .single();

      if (updateError) throw new Error("Erreur de confirmation de livraison.");

      // Step 4: Send notification to user
      await supabase.from('notifications').insert({
        user_id: order.user_id,
        title: 'Commande livrée',
        body: `Votre commande #${order.id} a été livrée avec succès.`,
      });

      await sendPushNotification(order.user_id, 'Commande livrée', `Votre commande #${order.id} est livrée ✅`, { type: 'ORDER_DELIVERED', orderId: order.id, screen: 'OrderTracking' }, supabase);

      return updated;
    },
    manualConfirmDelivery: async (_, { orderId, delivererId }, { supabase }) => {
      // Fetch the order
      const { data: order, error: fetchError } = await supabase
        .from("orders")
        .select("id, status, user_id, deliverer_id")
        .eq("id", orderId)
        .single();

      if (fetchError || !order) throw new Error("Commande introuvable.");

      if (order.status === "COMPLETED") {
        throw new Error("Commande déjà livrée.");
      }

      // Optional: Check if assigned deliverer is the one confirming
      if (order.deliverer_id !== delivererId) {
        throw new Error("Vous n'êtes pas assigné à cette commande.");
      }

      // Update order
      const { data: updated, error: updateError } = await supabase
        .from("orders")
        .update({
          status: "COMPLETED",
          delivered_by: delivererId,
          delivered_at: new Date().toISOString(),
          delivery_confirmation_method: "manual",
        })
        .eq("id", orderId)
        .select()
        .single();

      if (updateError) throw new Error("Échec de la confirmation manuelle.");

      // Send notification
      await supabase.from('notifications').insert({
        user_id: order.user_id,
        title: 'Commande livrée (confirmation manuelle)',
        body: `Votre commande #${order.id} a été confirmée comme livrée.`,
      });

      await sendPushNotification(order.user_id, 'Commande livrée', `Votre commande #${order.id} a été livrée ✅`, { type: 'ORDER_DELIVERED', orderId: order.id, screen: 'OrderTracking' }, supabase);

      return updated;
    },

    deleteOrder: async (_, { id }, { supabase }) => {
      try {
        // First, check if the order exists and get its status
        const { data: order, error: fetchError } = await supabase
          .from("orders")
          .select("id, status, user_id")
          .eq("id", id)
          .single();

        if (fetchError || !order) {
          throw new Error("Commande introuvable.");
        }

        // Only allow deletion of completed or cancelled orders
        if (order.status !== "COMPLETED" && order.status !== "CANCELLED") {
          throw new Error("Seules les commandes terminées ou annulées peuvent être supprimées.");
        }

        // Delete associated order items first (due to foreign key constraint)
        const { error: itemsError } = await supabase
          .from("order_items")
          .delete()
          .eq("order_id", id);

        if (itemsError) {
          console.error("Error deleting order items:", itemsError);
          throw new Error("Impossible de supprimer les articles de la commande.");
        }

        // Delete the order
        const { error: deleteError } = await supabase
          .from("orders")
          .delete()
          .eq("id", id);

        if (deleteError) {
          console.error("Error deleting order:", deleteError);
          throw new Error("Impossible de supprimer la commande.");
        }

        return true;
      } catch (err) {
        console.error("Error in deleteOrder mutation:", err.message);
        throw new Error(err.message);
      }
    },

    updateUser: async (_, { id, input }, { supabase }) => {
      // Prepare the update input, excluding phone number and role
      const updateData = {};

      // Only update fields that are provided in the input
      if (input.name) updateData.name = input.name;
      if (input.profilePicture) updateData.profile_picture = input.profilePicture;

      // If password is provided, hash it
      if (input.password) {
        const hashedPassword = await bcrypt.hash(input.password, 10);
        updateData.password = hashedPassword;
      }

      const { data, error } = await supabase
        .from("users")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw new Error(error.message);

      return {
        ...data,
        phoneNumber: data.phone_number,
        createdAt: data.created_at,
        profilePicture: data.profile_picture,
      };
    },
    deleteUser: async (_, { id }, { supabase }) => {
      const { error } = await supabase.from("users").delete().eq("id", id);
      if (error) throw new Error(error.message);
      return true;
    },
    markNotificationAsRead: async (_, { id }, { supabase }) => {
      try {
        const { data, error } = await supabase
          .from("notifications")
          .update({ read: true })
          .eq("id", id)
          .select()
          .single();

        if (error) throw new Error(`Error updating notification: ${error.message}`);

        return {
          id: data.id,
          userId: data.user_id,
          title: data.title,
          body: data.body,
          read: data.read,
          createdAt: data.created_at
        };
      } catch (err) {
        console.error("Error marking notification as read:", err);
        throw new Error(err.message);
      }
    },
    markAllNotificationsAsRead: async (_, { userId }, { supabase }) => {
      try {
        const { error } = await supabase
          .from("notifications")
          .update({ read: true })
          .eq("user_id", userId)
          .eq("read", false);

        if (error) throw new Error(`Error updating notifications: ${error.message}`);

        return true;
      } catch (err) {
        console.error("Error marking all notifications as read:", err);
        throw new Error(err.message);
      }
    },
    deleteNotification: async (_, { id }, { supabase }) => {
      try {
        const { error } = await supabase
          .from('notifications')
          .delete()
          .eq('id', id);

        if (error) throw new Error(`Error deleting notification: ${error.message}`);
        return true;
      } catch (err) {
        console.error('Error deleting notification:', err);
        throw new Error(err.message);
      }
    },
    updateDelivererLocation: async (_, { userId, location }, { supabase }) => {
      try {
        const { data: deliverer, error } = await supabase
          .from("deliverers")
          .update({
            current_location: {
              address: location.address,
              latitude: location.latitude,
              longitude: location.longitude
            }
          })
          .eq("user_id", userId)
          .select()
          .single();

        if (error) throw new Error(error.message);

        return {
          ...deliverer,
          userId: deliverer.user_id,
          vehicleId: deliverer.vehicle_id,
          isAvailable: deliverer.is_available,
          currentLocation: deliverer.current_location,
          zone: deliverer.zone,
          profilePicture: deliverer.profile_picture,
          isActive: deliverer.is_active,
          isVerified: deliverer.is_verified
        };
      } catch (error) {
        console.error("Error updating deliverer location:", error);
        throw new Error(error.message);
      }
    },
    updateDelivererStatus: async (_, { userId, isAvailable }, { supabase }) => {
      try {
        const { data: deliverer, error } = await supabase
          .from("deliverers")
          .update({ is_available: isAvailable })
          .eq("user_id", userId)
          .select()
          .single();

        if (error) throw new Error(error.message);

        return {
          ...deliverer,
          userId: deliverer.user_id,
          vehicleId: deliverer.vehicle_id,
          isAvailable: deliverer.is_available,
          currentLocation: deliverer.current_location,
          zone: deliverer.zone,
          profilePicture: deliverer.profile_picture,
          isActive: deliverer.is_active,
          isVerified: deliverer.is_verified
        };
      } catch (error) {
        console.error("Error updating deliverer status:", error);
        throw new Error(error.message);
      }
    },
    updateDeliverer: async (_, { userId, input }, { supabase }) => {
      const { data, error } = await supabase
        .from("deliverers")
        .update(input)
        .eq("user_id", userId)
        .select()
        .single();

      if (error) throw new Error(error.message);

      return {
        ...data,
        userId: data.user_id,
        vehicleId: data.vehicle_id,
        isAvailable: data.is_available,
        currentLocation: data.current_location,
        zone: data.zone,
        isActive: data.is_active,
        isVerified: data.is_verified
      };
    },
    addRestaurantRating: async (_, { input }, { supabase }) => {
      try {
        // Check if user has already rated this restaurant
        const { data: existingRating } = await supabase
          .from('restaurant_ratings')
          .select('id')
          .eq('restaurant_id', input.restaurantId)
          .eq('user_id', input.userId)
          .single();

        if (existingRating) {
          throw new Error('You have already rated this restaurant');
        }

        const { data, error } = await supabase
          .from('restaurant_ratings')
          .insert([{
            restaurant_id: input.restaurantId,
            user_id: input.userId,
            rating: input.rating,
            comment: input.comment
          }])
          .select()
          .single();

        if (error) throw new Error(`Error adding rating: ${error.message}`);

        return {
          id: data.id,
          restaurantId: data.restaurant_id,
          userId: data.user_id,
          rating: data.rating,
          comment: data.comment,
          createdAt: data.created_at,
          updatedAt: data.updated_at
        };
      } catch (err) {
        console.error("Error in addRestaurantRating mutation:", err);
        throw new Error(err.message);
      }
    },

    updateRestaurantRating: async (_, { id, input }, { supabase }) => {
      try {
        const { data, error } = await supabase
          .from('restaurant_ratings')
          .update({
            rating: input.rating,
            comment: input.comment,
            updated_at: new Date().toISOString()
          })
          .eq('id', id)
          .select()
          .single();

        if (error) throw new Error(`Error updating rating: ${error.message}`);

        return {
          id: data.id,
          restaurantId: data.restaurant_id,
          userId: data.user_id,
          rating: data.rating,
          comment: data.comment,
          createdAt: data.created_at,
          updatedAt: data.updated_at
        };
      } catch (err) {
        console.error("Error in updateRestaurantRating mutation:", err);
        throw new Error(err.message);
      }
    },

    deleteRestaurantRating: async (_, { id }, { supabase }) => {
      try {
        const { error } = await supabase
          .from('restaurant_ratings')
          .delete()
          .eq('id', id);

        if (error) throw new Error(`Error deleting rating: ${error.message}`);

        return true;
      } catch (err) {
        console.error("Error in deleteRestaurantRating mutation:", err);
        throw new Error(err.message);
      }
    },

    updateOrderNote: async (_, { orderId, note }, { supabase }) => {
      try {
        const { data, error } = await supabase
          .from('orders')
          .update({ note })
          .eq('id', orderId)
          .select()
          .single();

        if (error) throw new Error(`Error updating order note: ${error.message}`);

        return {
          id: data.id,
          restaurantId: data.restaurant_id,
          userId: data.user_id,
          items: data.items,
          totalAmount: data.total_amount,
          deliveryAddress: data.delivery_address,
          instructions: data.instructions,
          note: data.note,
          status: data.status,
          isPaid: data.is_paid,
          paymentMethod: data.payment_method,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          delivererId: data.deliverer_id
        };
      } catch (err) {
        console.error("Error in updateOrderNote mutation:", err);
        throw new Error(err.message);
      }
    },

    updateOrderRating: async (_, { orderId, rating }, { supabase }) => {
      try {
        // Check if order exists and is completed
        const { data: order, error: orderError } = await supabase
          .from('orders')
          .select('status')
          .eq('id', orderId)
          .single();

        if (orderError) throw new Error('Order not found');
        if (order.status !== 'COMPLETED') throw new Error('Can only rate completed orders');

        const { data, error } = await supabase
          .from('orders')
          .update({
            rating,
            updated_at: new Date().toISOString()
          })
          .eq('id', orderId)
          .select()
          .single();

        if (error) throw new Error(`Error updating order rating: ${error.message}`);

        return {
          id: data.id,
          restaurantId: data.restaurant_id,
          userId: data.user_id,
          items: data.items,
          totalAmount: data.total_amount,
          deliveryAddress: data.delivery_address,
          instructions: data.instructions,
          note: data.note,
          rating: data.rating,
          status: data.status,
          isPaid: data.is_paid,
          paymentMethod: data.payment_method,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          delivererId: data.deliverer_id
        };
      } catch (err) {
        console.error("Error in updateOrderRating mutation:", err);
        throw new Error(err.message);
      }
    },

    updateOrderFeedback: async (_, { orderId, rating, note }, { supabase }) => {
      try {
        // Check if order exists and is completed
        const { data: order, error: orderError } = await supabase
          .from('orders')
          .select('status')
          .eq('id', orderId)
          .single();

        if (orderError) throw new Error('Order not found');
        if (order.status !== 'COMPLETED') throw new Error('Can only rate completed orders');

        const { data, error } = await supabase
          .from('orders')
          .update({
            rating,
            note,
            updated_at: new Date().toISOString()
          })
          .eq('id', orderId)
          .select()
          .single();

        if (error) throw new Error(`Error updating order feedback: ${error.message}`);

        return {
          id: data.id,
          restaurantId: data.restaurant_id,
          userId: data.user_id,
          items: data.items,
          totalAmount: data.total_amount,
          deliveryAddress: data.delivery_address,
          instructions: data.instructions,
          note: data.note,
          rating: data.rating,
          status: data.status,
          isPaid: data.is_paid,
          paymentMethod: data.payment_method,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          delivererId: data.deliverer_id
        };
      } catch (err) {
        console.error("Error in updateOrderFeedback mutation:", err);
        throw new Error(err.message);
      }
    },

    rateOrderComplete: async (_, { input }, { supabase }) => {
      try {
        const { orderId, restaurantRating, restaurantComment, delivererRating, delivererComment } = input;

        // Get order details
        const { data: order, error: orderError } = await supabase
          .from('orders')
          .select('id, user_id, restaurant_id, deliverer_id, status')
          .eq('id', orderId)
          .single();

        if (orderError || !order) throw new Error('Commande introuvable');
        if (order.status !== 'COMPLETED') throw new Error('Seules les commandes terminées peuvent être notées');

        // Update order with both ratings
        const { data: updated, error: updateError } = await supabase
          .from('orders')
          .update({
            rating: restaurantRating,
            note: restaurantComment,
            deliverer_rating: delivererRating,
            deliverer_rating_comment: delivererComment,
            updated_at: new Date().toISOString()
          })
          .eq('id', orderId)
          .select()
          .single();

        if (updateError) {
          console.error('Error updating order ratings:', updateError);
          throw new Error('Impossible de sauvegarder les notes');
        }

        // Optionally: Create separate deliverer_rating record if table exists
        // This allows for detailed deliverer analytics
        if (order.deliverer_id && delivererRating) {
          try {
            await supabase.from('deliverer_ratings').insert({
              deliverer_id: order.deliverer_id,
              order_id: orderId,
              user_id: order.user_id,
              rating: delivererRating,
              comment: delivererComment
            });
          } catch (err) {
            // Table might not exist yet, just log but don't fail
            
          }
        }

        return {
          id: updated.id,
          restaurantId: updated.restaurant_id,
          userId: updated.user_id,
          totalAmount: updated.total_amount,
          deliveryAddress: updated.delivery_address,
          instructions: updated.instructions,
          note: updated.note,
          rating: updated.rating,
          delivererRating: updated.deliverer_rating,
          delivererRatingComment: updated.deliverer_rating_comment,
          status: updated.status,
          isPaid: updated.is_paid,
          paymentMethod: updated.payment_method,
          createdAt: updated.created_at,
          updatedAt: updated.updated_at,
          delivererId: updated.deliverer_id
        };
      } catch (err) {
        console.error("Error in rateOrderComplete mutation:", err);
        throw new Error(err.message);
      }
    },
  },
  Order: {
    user: (parent) => {
      if (!parent.user) return null;
      return {
        ...parent.user,
        phoneNumber: parent.user.phoneNumber || parent.user.phone_number || "Not provided",
        createdAt: parent.user.created_at,
      };
    },
    rating: (parent) => parent.rating || null
  },
  Restaurant: {
    rating: async (parent, _, { supabase }) => {
      try {
        // Get all completed orders with ratings for this restaurant
        const { data: orders, error } = await supabase
          .from('orders')
          .select('rating')
          .eq('restaurant_id', parent.id)
          .eq('status', 'COMPLETED')
          .not('rating', 'is', null);

        if (error) throw new Error(`Error fetching order ratings: ${error.message}`);

        if (!orders || orders.length === 0) return null;

        // Calculate average rating
        const totalRating = orders.reduce((sum, order) => sum + order.rating, 0);
        return totalRating / orders.length;
      } catch (err) {
        console.error("Error calculating restaurant rating:", err);
        return null;
      }
    },
    totalRatings: async (parent, _, { supabase }) => {
      try {
        // Count completed orders with ratings for this restaurant
        const { count, error } = await supabase
          .from('orders')
          .select('rating', { count: 'exact' })
          .eq('restaurant_id', parent.id)
          .eq('status', 'COMPLETED')
          .not('rating', 'is', null);

        if (error) throw new Error(`Error counting ratings: ${error.message}`);

        return count || 0;
      } catch (err) {
        console.error("Error counting restaurant ratings:", err);
        return 0;
      }
    }
  },
  Deliverer: {
    user: async (parent, _, { supabase }) => {
      if (parent.user) return parent.user; // already resolved
      if (!parent.user_id) return null;
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", parent.user_id)
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

    averageRating: async (parent, _, { supabase }) => {
      try {
        // Get all completed orders with deliverer ratings for this deliverer
        const { data: orders, error } = await supabase
          .from('orders')
          .select('deliverer_rating')
          .eq('deliverer_id', parent.user_id)
          .eq('status', 'COMPLETED')
          .not('deliverer_rating', 'is', null);

        if (error) throw new Error(`Error fetching deliverer ratings: ${error.message}`);
        if (!orders || orders.length === 0) return null;

        const sum = orders.reduce((acc, order) => acc + (order.deliverer_rating || 0), 0);
        const average = sum / orders.length;

        return Math.round(average * 10) / 10; // Round to 1 decimal place
      } catch (err) {
        console.error("Error calculating deliverer average rating:", err);
        return null;
      }
    },

    totalRatings: async (parent, _, { supabase }) => {
      try {
        // Count completed orders with deliverer ratings
        const { count, error } = await supabase
          .from('orders')
          .select('deliverer_rating', { count: 'exact' })
          .eq('deliverer_id', parent.user_id)
          .eq('status', 'COMPLETED')
          .not('deliverer_rating', 'is', null);

        if (error) throw new Error(`Error counting deliverer ratings: ${error.message}`);

        return count || 0;
      } catch (err) {
        console.error("Error counting deliverer ratings:", err);
        return 0;
      }
    }
  },
};

export default resolvers;
