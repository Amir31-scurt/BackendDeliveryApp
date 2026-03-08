import { supabase } from "../supabaseClient.js";

// Helper function to calculate distance using Haversine formula
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

export const restaurantResolvers = {
  Query: {
    restaurants: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Transform the data to match GraphQL schema
      return data.map(transformRestaurantData);
    },

    restaurantsNearby: async (_, { latitude, longitude, maxDistance = 10.0 }) => {
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

        

        return restaurantsWithDistance.map(transformRestaurantData);

      } catch (error) {
        console.error('Error in restaurantsNearby:', error);
        // Return empty array instead of null to satisfy GraphQL non-null constraint
        return [];
      }
    },

    restaurant: async (_, { id }) => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;

      // Transform the data to match GraphQL schema
      return transformRestaurantData(data);
    },

    searchRestaurants: async (_, { query }) => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("*")
        .ilike("name", `%${query}%`)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return data.map(transformRestaurantData);
    },
  },
};
