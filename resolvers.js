import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const resolvers = {
  Query: {
    restaurants: async (_, __, { supabase }) => {
      const { data, error } = await supabase.from("restaurants").select("*");
      if (error) throw new Error(error.message);
      return data;
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
    orders: async (_, __, { supabase }) => {
      const { data, error } = await supabase.from("orders").select("*");
      if (error) throw new Error(error.message);
      return data;
    },
    order: async (_, { id }, { supabase }) => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
  },
  Mutation: {
    // createRestaurant: async (_, { input }, { supabase }) => {
    //   const { data, error } = await supabase
    //     .from("restaurants")
    //     .insert([input])
    //     .select()
    //     .single();
    //   if (error) throw new Error(error.message);
    //   return data;
    // },
    // updateRestaurant: async (_, { id, input }, { supabase }) => {
    //   const { data, error } = await supabase
    //     .from("restaurants")
    //     .update(input)
    //     .eq("id", id)
    //     .select()
    //     .single();
    //   if (error) throw new Error(error.message);
    //   return data;
    // },
    // deleteRestaurant: async (_, { id }, { supabase }) => {
    //   const { error } = await supabase
    //     .from("restaurants")
    //     .delete()
    //     .eq("id", id);
    //   if (error) throw new Error(error.message);
    //   return true;
    // },
    // createOrder: async (_, { input }, { supabase }) => {
    //   const { data, error } = await supabase
    //     .from("orders")
    //     .insert([input])
    //     .select()
    //     .single();
    //   if (error) throw new Error(error.message);
    //   return data;
    // },
    // updateOrderStatus: async (_, { id, status }, { supabase }) => {
    //   const { data, error } = await supabase
    //     .from("orders")
    //     .update({ status })
    //     .eq("id", id)
    //     .select()
    //     .single();
    //   if (error) throw new Error(error.message);
    //   return data;
    // },
    register: async (_, { input }, { supabase }) => {
      const { username, email, password } = input;
      const hashedPassword = await bcrypt.hash(password, 10);
      const { data, error } = await supabase
        .from("users")
        .insert([{ username, email, password: hashedPassword }])
        .select()
        .single();
      if (error) throw new Error(error.message);
      return jwt.sign({ userId: data.id }, process.env.JWT_SECRET, {
        expiresIn: "1d",
      });
    },
    login: async (_, { input }, { supabase }) => {
      const { username, password } = input;
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("username", username)
        .single();
      if (error) throw new Error("User not found");
      const valid = await bcrypt.compare(password, data.password);
      if (!valid) throw new Error("Invalid password");
      return jwt.sign({ userId: data.id }, process.env.JWT_SECRET, {
        expiresIn: "1d",
      });
    },
  },
};

export default resolvers;
