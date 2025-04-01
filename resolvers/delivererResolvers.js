import { supabase } from "../supabaseClient.js";

export const delivererResolvers = {
  Query: {
    deliverer: async (_, { id }, { pool }) => {
      const query = `
        SELECT d.*, u.id as user_id, u.name, u.phone_number, u.role
        FROM deliverers d
        JOIN users u ON d.user_id = u.id
        WHERE d.id = $1
      `;
      const { rows } = await pool.query(query, [id]);
      const data = rows[0];
      if (!data) throw new Error("Deliverer not found.");
      return data;
    },

    delivererByUserId: async (_, { userId }, { pool }) => {
      const query = `
        SELECT d.*, u.id as user_id, u.name, u.phone_number, u.role
        FROM deliverers d
        JOIN users u ON d.user_id = u.id
        WHERE d.user_id = $1
      `;
      const { rows } = await pool.query(query, [userId]);
      const data = rows[0];
      if (!data) throw new Error("Deliverer not found.");
      return data;
    },

    allDeliverers: async (_, __, { pool }) => {
      const query = `
        SELECT d.*, u.id as user_id, u.name, u.phone_number, u.role
        FROM deliverers d
        JOIN users u ON d.user_id = u.id
        ORDER BY d.created_at DESC
      `;
      const { rows } = await pool.query(query);
      return rows;
    },

    availableDeliverers: async (_, __, { pool }) => {
      const query = `
        SELECT d.*, u.id as user_id, u.name, u.phone_number, u.role
        FROM deliverers d
        JOIN users u ON d.user_id = u.id
        WHERE d.is_available = true
        ORDER BY d.created_at DESC
      `;
      const { rows } = await pool.query(query);
      return rows;
    },
  },

  Mutation: {
    createDeliverer: async (_, { input }, { pool, user }) => {
      // Ensure user is authenticated
      if (!user) {
        throw new Error("Authentication required");
      }

      const insertQuery = `
        INSERT INTO deliverers (user_id, vehicle_id, is_available, current_location, zone, profile_picture, is_verified)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *;
      `;
      const values = [
        user.id,
        input.vehicleId,
        input.isAvailable ?? true,
        input.currentLocation,
        input.zone,
        input.profilePicture,
        false, // New deliverers start unverified
      ];
      const { rows } = await pool.query(insertQuery, values);
      const data = rows[0];
      return data;
    },

    updateDelivererStatus: async (_, { id, isAvailable }, { pool, user }) => {
      // Ensure user is authenticated and authorized
      if (!user) {
        throw new Error("Authentication required");
      }

      const updateQuery = `
        UPDATE deliverers
        SET is_available = $1
        WHERE id = $2
        RETURNING *;
      `;
      const { rows } = await pool.query(updateQuery, [isAvailable, id]);
      const data = rows[0];
      return data;
    },

    updateDelivererLocation: async (_, { id, location }, { pool, user }) => {
      // Ensure user is authenticated and authorized
      if (!user) {
        throw new Error("Authentication required");
      }

      const updateQuery = `
        UPDATE deliverers
        SET current_location = $1
        WHERE id = $2
        RETURNING *;
      `;
      const { rows } = await pool.query(updateQuery, [location, id]);
      const data = rows[0];
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
