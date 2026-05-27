const {supabase} = require("../supabaseClient.js");

const delivererResolvers = {
  Query: {
    deliverer: async (_, {id}) => {
      const {data, error} = await supabase
        .from("deliverers")
        .select(
          `
          *,
          user:users (
            id,
            name,
            phone_number,
            role
          )
        `,
        )
        .eq("id", id)
        .single();

      if (error) throw error;
      return data;
    },

    delivererByUserId: async (_, {userId}) => {
      const {data, error} = await supabase
        .from("deliverers")
        .select(
          `
          *,
          user:users (
            id,
            name,
            phone_number,
            role
          )
        `,
        )
        .eq("user_id", userId)
        .single();

      if (error) throw error;
      return data;
    },

    allDeliverers: async () => {
      const {data, error} = await supabase
        .from("deliverers")
        .select(
          `
          *,
          user:users (
            id,
            name,
            phone_number,
            role
          )
        `,
        )
        .order("created_at", {ascending: false});

      if (error) throw error;
      return data;
    },

    availableDeliverers: async () => {
      const {data, error} = await supabase
        .from("deliverers")
        .select(
          `
          *,
          user:users (
            id,
            name,
            phone_number,
            role
          )
        `,
        )
        .eq("is_available", true)
        .order("created_at", {ascending: false});

      if (error) throw error;
      return data;
    },
  },

  Mutation: {
    createDeliverer: async (_, {input}, context) => {
      // Ensure user is authenticated
      if (!context.user) {
        throw new Error("Authentication required");
      }

      const {data, error} = await supabase
        .from("deliverers")
        .insert({
          user_id: context.user.id,
          vehicle_id: input.vehicleId,
          is_available: input.isAvailable ?? true,
          current_location: input.currentLocation,
          zone: input.zone,
          profile_picture: input.profilePicture,
          is_verified: false, // New deliverers start unverified
        })
        .single();

      if (error) throw error;
      return data;
    },

    updateDelivererStatus: async (_, {id, isAvailable}, context) => {
      // Ensure user is authenticated and authorized
      if (!context.user) {
        throw new Error("Authentication required");
      }

      const {data, error} = await supabase
        .from("deliverers")
        .update({is_available: isAvailable})
        .eq("id", id)
        .single();

      if (error) throw error;
      return data;
    },

    updateDelivererLocation: async (_, {id, location}, context) => {
      // Ensure user is authenticated and authorized
      if (!context.user) {
        throw new Error("Authentication required");
      }

      const {data, error} = await supabase
        .from("deliverers")
        .update({current_location: location})
        .eq("id", id)
        .single();

      if (error) throw error;
      return data;
    },
  },

  // Field resolvers if needed
  Deliverer: {
    // Add any specific field resolvers here if needed
    userId: (parent) => parent.user_id,
    vehicleId: (parent) => parent.vehicle_id,
    isAvailable: (parent) => parent.is_available,
    currentLocation: (parent) => parent.current_location,
    profilePicture: (parent) => parent.profile_picture,
    isVerified: (parent) => parent.is_verified,
    user: (parent) => {
      if (!parent.user) return null;
      return {
        ...parent.user,
        phoneNumber: parent.user.phone_number,
        createdAt: parent.user.created_at,
      };
    },
  },
};

module.exports = {delivererResolvers};
module.exports.delivererResolvers = delivererResolvers;
