import bcrypt from "bcrypt";
import { validateEmail } from "./utils/validators.js";
import { Expo } from 'expo-server-sdk';

const expo = new Expo();

async function sendPushNotification(userId, messageText, supabase) {
  // 1. Get the user's saved push token from Supabase
  const { data: tokens, error } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('user_id', userId);

  if (error || !tokens || tokens.length === 0) {
    console.warn('No push token found for user');
    return;
  }

  // 2. Create the message(s)
  const messages = tokens.map(({ token }) => ({
    to: token,                     // Expo push token
    sound: 'default',
    title: 'Mise à jour de la commande',
    body: messageText,            // e.g. "Your order is now ready"
  }));

  // 3. Send messages using Expo SDK
  const chunks = expo.chunkPushNotifications(messages);

  for (const chunk of chunks) {
    try {
      const receipts = await expo.sendPushNotificationsAsync(chunk);
      console.log('Sent:', receipts);
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
const transformRestaurantData = (restaurant) => ({
  ...restaurant,
  phoneNumber: restaurant.phone_number,
  imageUrl: restaurant.image_url,
  isActive: restaurant.is_active,
  createdAt: restaurant.created_at,
  updatedAt: restaurant.updated_at,
  distance: restaurant.distance,
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
});

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
          .select(`
            *,
            orders(
              rating,
              status
            )
          `);

        if (error) throw new Error(error.message);

        // Fetch all completed orders with ratings and notes for all restaurants
        const { data: orders, error: ordersError } = await supabase
          .from("orders")
          .select("id, rating, note, user_id, restaurant_id, created_at")
          .eq("status", "COMPLETED");

        if (ordersError) throw new Error(ordersError.message);

        // Fetch all users for feedbacks
        const userIds = [...new Set(orders.map(order => order.user_id))];
        const { data: users, error: usersError } = await supabase
          .from("users")
          .select("id, name")
          .in("id", userIds);

        const userMap = {};
        (users || []).forEach(user => {
          userMap[user.id] = user.name;
        });

        // Calculate average ratings for each restaurant
        const restaurantsWithRatings = restaurants.map(restaurant => {
          // Filter for completed orders with ratings
          const validRatings = restaurant.orders
            .filter(order => order.status === 'COMPLETED' && order.rating !== null)
            .map(order => order.rating);

          const averageRating = validRatings.length > 0
            ? validRatings.reduce((sum, rating) => sum + rating, 0) / validRatings.length
            : null;

          return {
            ...restaurant,
            phoneNumber: restaurant.phone_number || "Not provided",
            createdAt: restaurant.created_at || "Not provided",
            updatedAt: restaurant.updated_at || "Not provided",
            isActive: restaurant.is_active,
            rating: averageRating,
            totalRatings: validRatings.length,
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
        throw new Error(err.message);
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
          console.log('No restaurants with coordinates found');
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

        console.log(`Found ${restaurantsWithDistance.length} restaurants within ${maxDistance}km of (${latitude}, ${longitude})`);

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
    menuItem: async (_, { id }, { supabase }) => {
      try {
        console.log(`Fetching menu item with id: ${id}`);

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

        console.log(`Found menu item: ${JSON.stringify(data)}`);

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
          .select(
            `*, 
            order_items(menu_item_id, quantity, price, menu_item:menu_items(id, name, description, price, image_url)), 
            user:users(id, name, phone_number), 
            restaurant:restaurants(id, name, description, address, type, opening_hours, phone_number, email, image_url, is_active, created_at, updated_at, latitude, longitude)`
          );

        if (userId) query = query.eq("user_id", userId);
        if (restaurantId) query = query.eq("restaurant_id", restaurantId);
        if (status) query = query.eq("status", status);
        if (delivererId) query = query.eq("deliverer_id", delivererId);

        const { data: orders, error } = await query;

        if (error) throw new Error(`Failed to fetch orders: ${error.message}`);

        // For each order, fetch deliverer info if deliverer_id exists
        const ordersWithDeliverer = await Promise.all((orders || []).map(async (order) => {
          let deliverer = null;
          if (order.deliverer_id) {
            const { data: delivererData, error: delivererError } = await supabase
              .from("deliverers")
              .select("*")
              .eq("user_id", order.deliverer_id)
              .single();

            let userData = null;
            if (delivererData && delivererData.user_id) {
              const { data: userRow, error: userError } = await supabase
                .from("users")
                .select("id, name, phone_number")
                .eq("id", delivererData.user_id)
                .single();

              if (!userError && userRow) {
                userData = {
                  id: userRow.id,
                  name: userRow.name,
                  phoneNumber: userRow.phone_number
                };
              } else {
                userData = null;
              }
            }

            if (!delivererError && delivererData) {
              deliverer = {
                userId: delivererData.user_id,
                user_id: delivererData.user_id, // for Deliverer.user resolver
                user: userData,
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
          }

          return {
            id: order.id,
            restaurantId: order.restaurant_id,
            userId: order.user_id,
            user: order.user ? {
              id: order.user.id,
              name: order.user.name,
              phoneNumber: order.user.phone_number
            } : null,
            restaurant: order.restaurant ? {
              id: order.restaurant.id,
              name: order.restaurant.name,
              description: order.restaurant.description,
              phoneNumber: order.restaurant.phone_number,
              address: order.restaurant.address,
              latitude: order.restaurant.latitude,
              longitude: order.restaurant.longitude
            } : null,
            items: (order.order_items || []).map((item) => ({
              menuItemId: item.menu_item_id,
              menuItem: item.menu_item
                ? {
                  id: item.menu_item.id,
                  name: item.menu_item.name,
                  description: item.menu_item.description,
                  price: item.menu_item.price,
                  imageUrl: item.menu_item.image_url || null
                }
                : null,
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
        }));

        return ordersWithDeliverer;
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
          .select(
            `*, 
        order_items(menu_item_id, quantity, price, menu_item:menu_items(id, name, description, price, image_url)), 
        user:users(id, name, phone_number), 
        restaurant:restaurants(id, name, description, address, type, opening_hours, phone_number, email, image_url, is_active, created_at, updated_at, latitude, longitude)`
          )
          .eq("id", id)
          .single();

        if (error) throw new Error(`Failed to fetch order: ${error.message}`);
        if (!order) throw new Error("Order not found");

        // Prepare deliverer info
        let deliverer = null;

        if (order.deliverer_id) {
          const { data: delivererData, error: delivererError } = await supabase
            .from("deliverers")
            .select("*")
            .eq("user_id", order.deliverer_id)
            .single();

          let userData = null;
          if (delivererData && delivererData.user_id) {
            const { data: userRow, error: userError } = await supabase
              .from("users")
              .select("id, name, phone_number")
              .eq("id", delivererData.user_id)
              .single();

            if (!userError && userRow) {
              userData = {
                id: userRow.id,
                name: userRow.name,
                phoneNumber: userRow.phone_number
              };
            } else {
              userData = null;
            }
          }

          if (!delivererError && delivererData) {
            deliverer = {
              userId: delivererData.user_id,
              user: userData,
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
        }

        return {
          id: order.id,
          restaurantId: order.restaurant_id,
          userId: order.user_id,
          user: {
            id: order.user.id,
            name: order.user.name,
            phoneNumber: order.user.phone_number
          },
          restaurant: {
            id: order.restaurant.id,
            name: order.restaurant.name,
            description: order.restaurant.description,
            phoneNumber: order.restaurant.phone_number,
            address: order.restaurant.address
          },
          items: order.order_items.map((item) => ({
            menuItemId: item.menu_item_id,
            menuItem: item.menu_item
              ? {
                id: item.menu_item.id,
                name: item.menu_item.name,
                description: item.menu_item.description,
                price: item.menu_item.price,
                imageUrl: item.menu_item.image_url || null
              }
              : null,
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
    restaurantRatings: async (_, { restaurantId }, { supabase }) => {
      try {
        const { data, error } = await supabase
          .from('restaurant_ratings')
          .select(`
            *,
            user:users(id, name, phone_number)
          `)
          .eq('restaurant_id', restaurantId)
          .order('created_at', { ascending: false });

        if (error) throw new Error(`Error fetching ratings: ${error.message}`);

        return data.map(rating => ({
          id: rating.id,
          restaurantId: rating.restaurant_id,
          userId: rating.user_id,
          user: rating.user,
          rating: rating.rating,
          comment: rating.comment,
          createdAt: rating.created_at,
          updatedAt: rating.updated_at
        }));
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

      // Map GraphQL fields to Supabase fields
      const dbInput = {};

      // Only include fields that are provided in the input
      if (input.name) dbInput.name = input.name;
      if (input.description) dbInput.description = input.description;
      if (input.address) dbInput.address = input.address;
      if (input.type) dbInput.type = input.type;
      if (input.email) dbInput.email = input.email;

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
        console.log(`Updating menu item with id: ${id}, input:`, input);

        // Map GraphQL fields to database column names
        const dbInput = {};

        if (input.name !== undefined) dbInput.name = input.name;
        if (input.description !== undefined) dbInput.description = input.description;
        if (input.price !== undefined) dbInput.price = input.price;
        if (input.category !== undefined) dbInput.category = input.category;
        if (input.isAvailable !== undefined) dbInput.is_available = input.isAvailable;

        // Map imageUrl to image_url
        if (input.imageUrl !== undefined) dbInput.image_url = input.imageUrl;

        console.log("Mapped database input:", dbInput);

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

        console.log("Updated menu item data:", data);

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
        console.log(`Attempting to delete menu item with id: ${id}`);

        const { error } = await supabase.from("menu_items").delete().eq("id", id);

        if (error) {
          console.error(`Error deleting menu item: ${error.message}`);
          throw new Error(error.message);
        }

        console.log(`Successfully deleted menu item with id: ${id}`);
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
            `Une nouvelle commande #${newOrder.id} vous a été assignée.`,
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

          await sendPushNotification(order.deliverer_id, delivererMessage, supabase);
        }

        // Insert notification in French
        await supabase.from('notifications').insert({
          user_id: order.user_id,
          title: 'Mise à jour de commande',
          body: `Votre commande #${order.id} est maintenant ${statusFrench}`,
        });

        await sendPushNotification(order.user_id, `Votre commande est maintenant ${statusFrench}`, supabase);
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

      await sendPushNotification(order.user_id, `Votre commande #${order.id} est livrée ✅`, supabase);

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

      await sendPushNotification(order.user_id, `Votre commande #${order.id} a été livrée ✅`, supabase);

      return updated;
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
    }
  },
};

export default resolvers;
