const bcrypt = require("bcrypt");
const {supabase} = require("../supabaseClient.js");

const signUp = async (
  phoneNumber,
  password,
  name,
  role = "customer",
  vehicleId,
) => {
  const {data, error} = await supabase.auth.signUp({
    phone: phoneNumber, // Use phone instead of email
    password: password,
  });

  if (error) throw error;

  if (data.user) {
    // Create a record in the users table
    const {error: profileError} = await supabase.from("users").insert({
      id: data.user.id,
      phone_number: phoneNumber,
      name: name,
      role: "customer",
      is_verified: false,
    });

    if (profileError) throw profileError;

    // If role is deliverer, insert additional details into deliverers table
    if (role === "deliverer") {
      const {error: delivererError} = await supabase.from("deliverers").insert({
        user_id: data.user.id,
        vehicle_id: vehicleId,
        is_available: true,
        current_location: null,
        zone: null,
        profile_picture: null,
        is_verified: true,
      });

      if (delivererError)
        throw new Error("Failed to create deliverer profile.");
    }
  }

  return data;
};

const signIn = async (phoneNumber, password) => {
  // Retrieve the user from the `users` table
  const {data: user, error} = await supabase
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
  return {user};
};

const signOut = async () => {
  const {error} = await supabase.auth.signOut();
  if (error) throw error;
};

const getCurrentUser = async () => {
  const {
    data: {user},
  } = await supabase.auth.getUser();
  if (!user) return null;

  const {data, error} = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) throw error;

  return data;
};

const updateUser = async (updates) => {
  const {
    data: {user},
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No user logged in");

  const {data, error} = await supabase
    .from("users")
    .update(updates)
    .eq("id", user.id)
    .single();

  if (error) throw error;

  return data;
};

const createDeliverer = async (delivererData) => {
  const {
    data: {user},
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No user logged in");

  // Insert deliverer-specific details into the deliverers table
  const {data, error} = await supabase
    .from("deliverers")
    .insert({
      user_id: user.id, // Link to the user
      vehicle_id: delivererData.vehicleId || null,
      is_available: delivererData.isAvailable || true,
      current_location: delivererData.currentLocation || null,
      zone: delivererData.zone || null,
      profile_picture: delivererData.profilePicture || null,
    })
    .single();

  if (error) {
    throw new Error("Failed to create deliverer profile.");
  }

  return data;
};

module.exports = { signUp, signIn, signOut, getCurrentUser, updateUser, createDeliverer };
