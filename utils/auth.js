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
  const { data, error } = await supabase.auth.signInWithPassword({
    phone: phoneNumber,
    password: password,
  });

  if (error) throw error;

  return data;
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
