import bcrypt from "bcrypt";
import { supabase } from "../supabaseClient.js";

export const signUp = async (phoneNumber, password, name) => {
  const { data, error } = await supabase.auth.signUp({
    phone: phoneNumber, // Use phone instead of email
    password: password,
  });

  if (error) throw error;

  if (data.user) {
    // Create a record in the users table
    const { error: profileError } = await supabase.from("users").insert({
      id: data.user.id,
      phone_number: phoneNumber,
      name: name,
      role: "customer",
      is_verified: false,
    });

    if (profileError) throw profileError;
  }

  return data;
};

export const signIn = async (phoneNumber, password) => {
  // Retrieve the user from the `users` table
  const { data: user, error } = await supabase
    .from("users")
    .select("*")
    .eq("phone_number", phoneNumber)
    .single();

  if (error || !user) {
    throw new Error("Numéro de téléphone ou mot de passe invalide.");
  }

  // Compare the hashed password
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    throw new Error("Numéro de téléphone ou mot de passe invalide.");
  }

  // If valid, return the user data (you can also generate a token here)
  return { user };
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const getCurrentUser = async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) throw error;

  return data;
};

export const updateUser = async (updates) => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No user logged in");

  const { data, error } = await supabase
    .from("users")
    .update(updates)
    .eq("id", user.id)
    .single();

  if (error) throw error;

  return data;
};

export const createDeliverer = async (delivererData) => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No user logged in");

  const { data, error } = await supabase
    .from("deliverers")
    .insert({
      ...delivererData,
      user_id: user.id,
    })
    .single();

  if (error) throw error;

  return data;
};
