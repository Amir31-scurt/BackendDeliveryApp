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
        isActive: restaurant.is_active || "Not provided", // Fallback value
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
      return data;
    },
    searchRestaurants: async (_, { query }, { supabase }) => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("*")
        .or(`name.ilike.%${query}%,address.ilike.%${query}%`);
      if (error) throw new Error(error.message);
      return data;
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
  },
};

export default resolvers;
