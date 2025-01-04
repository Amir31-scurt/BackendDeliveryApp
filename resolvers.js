import { validateEmail } from "./utils/validators.js";

const resolvers = {
  Query: {
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
  },
  Mutation: {
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
  },
};

export default resolvers;
