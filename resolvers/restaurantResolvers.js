import { supabase } from "../supabaseClient.js";

export const restaurantResolvers = {
  Query: {
    restaurants: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Transform the data to match GraphQL schema
      return data.map((restaurant) => ({
        ...restaurant,
        phoneNumber: restaurant.phone_number,
        imageUrl: restaurant.image_url,
        isActive: restaurant.is_active,
        createdAt: restaurant.created_at,
        updatedAt: restaurant.updated_at,
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
      }));
    },

    restaurant: async (_, { id }) => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;

      // Transform the data to match GraphQL schema
      return {
        ...data,
        phoneNumber: data.phone_number,
        imageUrl: data.image_url,
        isActive: data.is_active,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        openingHours: {
          monday: data.opening_hours?.monday || {
            open: "09:00",
            close: "22:00",
          },
          tuesday: data.opening_hours?.tuesday || {
            open: "09:00",
            close: "22:00",
          },
          wednesday: data.opening_hours?.wednesday || {
            open: "09:00",
            close: "22:00",
          },
          thursday: data.opening_hours?.thursday || {
            open: "09:00",
            close: "22:00",
          },
          friday: data.opening_hours?.friday || {
            open: "09:00",
            close: "22:00",
          },
          saturday: data.opening_hours?.saturday || {
            open: "09:00",
            close: "22:00",
          },
          sunday: data.opening_hours?.sunday || {
            open: "09:00",
            close: "22:00",
          },
        },
      };
    },

    searchRestaurants: async (_, { query }) => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("*")
        .ilike("name", `%${query}%`)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return data.map((restaurant) => ({
        ...restaurant,
        phoneNumber: restaurant.phone_number,
        imageUrl: restaurant.image_url,
        isActive: restaurant.is_active,
        createdAt: restaurant.created_at,
        updatedAt: restaurant.updated_at,
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
      }));
    },
  },
};
