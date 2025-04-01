import bcrypt from "bcrypt";
import { validateEmail } from "./utils/validators.js";

const resolvers = {
  Query: {
    users: async (_, __, { pool }) => {
      const query = 'SELECT * FROM users';
      const { rows } = await pool.query(query);

      // Handle null phone numbers
      const sanitizedData = rows.map((user) => ({
        ...user,
        name: user.name || "Not provided", // Fallback value
        phoneNumber: user.phone_number || "Not provided", // Fallback value
        createdAt: user.created_at || "Not provided", // Fallback value
        isVerified: user.is_verified,
        role: user.role || "Not provided", // Fallback value
      }));

      return sanitizedData;
    },
    user: async (_, { id }, { pool }) => {
      const query = 'SELECT * FROM users WHERE id = $1';
      const { rows } = await pool.query(query, [id]);
      const data = rows[0];
      return {
        ...data,
        name: data.name,
        phoneNumber: data.phone_number,
        role: data.role,
        isVerified: data.is_verified,
        createdAt: data.created_at,
      };
    },
    restaurants: async (_, __, { pool }) => {
      const query = 'SELECT * FROM restaurants';
      const { rows } = await pool.query(query);

      // Handle null phone numbers
      const sanitizedData = rows.map((restaurant) => ({
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
    restaurant: async (_, { id }, { pool }) => {
      const query = 'SELECT * FROM restaurants WHERE id = $1';
      const { rows } = await pool.query(query, [id]);
      const data = rows[0];

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
    searchRestaurants: async (_, { query }, { pool }) => {
      const sqlQuery = `
        SELECT * FROM restaurants
        WHERE name ILIKE $1 OR address ILIKE $1
      `;
      const { rows } = await pool.query(sqlQuery, [`%${query}%`]);
      return rows;
    },
    menuItems: async (_, { restaurantId }, { pool }) => {
      const query = 'SELECT * FROM menu_items WHERE restaurant_id = $1';
      const { rows } = await pool.query(query, [restaurantId]);

      return rows.map((menuItem) => ({
        ...menuItem,
        createdAt: menuItem.created_at || "Not provided",
        updatedAt: menuItem.updated_at || "Not provided",
        imageUrl: menuItem.image_url || null,
      }));
    },
    allMenuItems: async (_, __, { pool }) => {
      const query = 'SELECT * FROM menu_items';
      const { rows } = await pool.query(query);

      return rows.map((menuItem) => ({
        ...menuItem,
        restaurantId: menuItem.restaurant_id,
        createdAt: menuItem.created_at || "Not provided",
        updatedAt: menuItem.updated_at || "Not provided",
        imageUrl: menuItem.image_url || null,
      }));
    },
    orders: async (_, { userId, restaurantId, status }, { pool }) => {
      try {
        let query = `
          SELECT o.*, oi.menu_item_id, oi.quantity, oi.price, mi.id, mi.name, mi.description, mi.price, mi.image_url, u.id, u.name, u.phone_number
          FROM orders o
          JOIN order_items oi ON o.id = oi.order_id
          JOIN menu_items mi ON oi.menu_item_id = mi.id
          JOIN users u ON o.user_id = u.id
        `;
        const conditions = [];
        const values = [];

        if (userId) {
          conditions.push(`o.user_id = $${conditions.length + 1}`);
          values.push(userId);
        }
        if (restaurantId) {
          conditions.push(`o.restaurant_id = $${conditions.length + 1}`);
          values.push(restaurantId);
        }
        if (status) {
          conditions.push(`o.status = $${conditions.length + 1}`);
          values.push(status);
        }

        if (conditions.length > 0) {
          query += ` WHERE ${conditions.join(' AND ')}`;
        }

        const { rows: orders } = await pool.query(query, values);

        if (!orders || orders.length === 0) throw new Error("No orders found");

        return orders.map((order) => ({
          id: order.id,
          restaurantId: order.restaurant_id,
          userId: order.user_id,
          items: order.order_items.map((item) => ({
            menuItemId: item.menu_item_id,
            menuItem: {
              ...item.menu_item,
              imageUrl: item.menu_item.image_url || null,
            },
            quantity: item.quantity,
            price: item.price,
          })),
          user: order.user,
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
    order: async (_, { id }, { pool }) => {
      try {
        const query = `
          SELECT o.*, oi.menu_item_id, oi.quantity, oi.price, mi.id, mi.name, mi.description, mi.price, mi.image_url
          FROM orders o
          JOIN order_items oi ON o.id = oi.order_id
          JOIN menu_items mi ON oi.menu_item_id = mi.id
          WHERE o.id = $1
        `;
        const { rows } = await pool.query(query, [id]);
        const order = rows[0];

        if (!order) throw new Error("Order not found");

        return {
          id: order.id,
          restaurantId: order.restaurant_id,
          userId: order.user_id,
          user: order.user,
          items: order.order_items.map((item) => ({
            menuItemId: item.menu_item_id,
            menuItem: item.menu_item ? {
              ...item.menu_item,
              imageUrl: item.menu_item.image_url || null,
            } : null, // Handle case where menu_item might be null
            quantity: item.quantity,
            price: item.price,
          })),
          totalAmount: order.total_amount,
          deliveryAddress: order.delivery_address,
          instructions: order.instructions,
          status: order.status,
          createdAt: order.created_at || null, // Ensure createdAt is mapped correctly
          updatedAt: order.updated_at || null,
        };
      } catch (err) {
        console.error("Error fetching order:", err.message);
        throw new Error(err.message);
      }
    },
    restaurantByEmail: async (_, { email }, { pool }) => {
      const query = 'SELECT * FROM restaurants WHERE email = $1';
      const { rows } = await pool.query(query, [email]);
      const data = rows[0];
      if (!data) throw new Error("Restaurant not found.");
      return data;
    },
  },
  Mutation: {
    createUser: async (_, { input }, { pool }) => {
      const password = "123456789";
      const hashedPassword = await bcrypt.hash(password, 10);
      // Map GraphQL fields to PostgreSQL fields
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
      const checkQuery = 'SELECT phone_number FROM users WHERE phone_number = $1';
      const { rows: existingUser } = await pool.query(checkQuery, [input.phoneNumber]);

      if (existingUser.length > 0) {
        throw new Error("Ce numéro est déjà utilisé.");
      }

      const insertQuery = `
        INSERT INTO users (name, password, phone_number, is_verified, role)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *;
      `;
      const values = [dbInput.name, dbInput.password, dbInput.phone_number, dbInput.is_verified, dbInput.role];
      const { rows } = await pool.query(insertQuery, values);
      const data = rows[0];

      return {
        ...data,
        phoneNumber: data.phone_number, // Map phone_number back to phoneNumber
      };
    },
    createRestaurant: async (_, { input }, { pool }) => {
      if (!validateEmail(input.email)) {
        throw new Error(`${input.email} n'est pas un adresse mail valide!`);
      }

      // Map GraphQL fields to PostgreSQL fields
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

      const insertQuery = `
        INSERT INTO restaurants (name, description, address, type, phone_number, email, opening_hours, is_active, image_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *;
      `;
      const values = [dbInput.name, dbInput.description, dbInput.address, dbInput.type, dbInput.phone_number, dbInput.email, dbInput.opening_hours, dbInput.is_active, dbInput.image_url];
      const { rows } = await pool.query(insertQuery, values);
      const data = rows[0];

      return data;
    },

    updateRestaurant: async (_, { id, input }, { pool }) => {
      if (input.email && !validateEmail(input.email)) {
        throw new Error(`${input.email} n'est pas un adresse mail valide!`);
      }
      const updateQuery = `
        UPDATE restaurants
        SET name = $1, description = $2, address = $3, type = $4, phone_number = $5, email = $6, opening_hours = $7, is_active = $8, image_url = $9
        WHERE id = $10
        RETURNING *;
      `;
      const values = [input.name, input.description, input.address, input.type, input.phoneNumber, input.email, input.openingHours, input.isActive, input.imageUrl, id];
      const { rows } = await pool.query(updateQuery, values);
      const data = rows[0];

      return data;
    },
    deleteRestaurant: async (_, { id }, { pool }) => {
      const deleteQuery = 'DELETE FROM restaurants WHERE id = $1';
      await pool.query(deleteQuery, [id]);
      return true;
    },
    addMenuItem: async (_, { input }, { pool }) => {
      const dbInput = {
        ...input,
        restaurant_id: input.restaurantId, // Map restaurantId to restaurant_id
        image_url: input.imageUrl, // Map imageUrl to image_url
      };

      delete dbInput.restaurantId; // Remove GraphQL-only field
      delete dbInput.imageUrl; // Remove GraphQL-only field

      const insertQuery = `
        INSERT INTO menu_items (name, description, price, category, image_url, restaurant_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *;
      `;
      const values = [dbInput.name, dbInput.description, dbInput.price, dbInput.category, dbInput.image_url, dbInput.restaurant_id];
      const { rows } = await pool.query(insertQuery, values);
      const data = rows[0];

      return {
        ...data,
        imageUrl: data.image_url || "Not provided", // Fallback value
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    },
    updateMenuItem: async (_, { id, input }, { pool }) => {
      const updateQuery = `
        UPDATE menu_items
        SET name = $1, description = $2, price = $3, category = $4, image_url = $5
        WHERE id = $6
        RETURNING *;
      `;
      const values = [input.name, input.description, input.price, input.category, input.imageUrl, id];
      const { rows } = await pool.query(updateQuery, values);
      const data = rows[0];

      return data;
    },
    createOrder: async (_, { input }, { pool }) => {
      try {
        const menuItemsQuery = `
          SELECT id, price FROM menu_items WHERE id = ANY($1::int[])
        `;
        const { rows: menuItems } = await pool.query(menuItemsQuery, [input.items.map((item) => item.menuItemId)]);

        const priceMap = Object.fromEntries(
          menuItems.map((item) => [item.id, item.price])
        );
        const totalAmount = input.items.reduce((total, item) => {
          const itemPrice = priceMap[item.menuItemId];
          if (!itemPrice)
            throw new Error(`Menu item not found: ${item.menuItemId}`);
          return total + itemPrice * item.quantity;
        }, 0);

        const orderInsertQuery = `
          INSERT INTO orders (user_id, restaurant_id, delivery_address, instructions, total_amount, status)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *;
        `;
        const orderValues = [input.userId, input.restaurantId, input.deliveryAddress, input.instructions || null, totalAmount, input.status || "Pending"];
        const { rows: newOrderRows } = await pool.query(orderInsertQuery, orderValues);
        const newOrder = newOrderRows[0];

        const orderItems = input.items.map((item) => ({
          order_id: newOrder.id,
          menu_item_id: item.menuItemId,
          quantity: item.quantity,
          price: priceMap[item.menuItemId],
        }));

        const orderItemsInsertQuery = `
          INSERT INTO order_items (order_id, menu_item_id, quantity, price)
          VALUES ($1, $2, $3, $4)
        `;
        for (const item of orderItems) {
          await pool.query(orderItemsInsertQuery, [item.order_id, item.menu_item_id, item.quantity, item.price]);
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
        };
      } catch (err) {
        console.error("Error in createOrder function:", err.message);
        throw new Error(err.message);
      }
    },
    updateOrderStatus: async (_, { id, status }, { pool }) => {
      const updateQuery = `
        UPDATE orders
        SET status = $1
        WHERE id = $2
        RETURNING *;
      `;
      const { rows } = await pool.query(updateQuery, [status, id]);
      const data = rows[0];

      return data;
    },
  },
};

export default resolvers;
