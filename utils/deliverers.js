import { supabase } from "../supabaseClient.js";

export const createDeliverer = async (delivererData) => {
  const { data, error } = await supabase
    .from("deliverers")
    .insert([
      {
        user_id: delivererData.userId,
        name: delivererData.name,
        phone_number: delivererData.phoneNumber,
        vehicle_id: delivererData.vehicleId,
        is_available: true,
        current_location: null,
        zone: delivererData.zone,
        profile_picture: delivererData.profilePicture || null,
        is_active: true,
      },
    ])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
};

export const getDelivererProfile = async (id) => {
  const { data, error } = await supabase
    .from("deliverers")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw new Error(error.message);
  return data;
};

export const updateDelivererProfile = async (id, updates) => {
  const { data, error } = await supabase
    .from("deliverers")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
};

export const updateDelivererLocation = async (id, latitude, longitude) => {
  const { data, error } = await supabase
    .from("deliverers")
    .update({
      current_location: `POINT(${longitude} ${latitude})`,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
};

export const toggleDelivererAvailability = async (id) => {
  // First, get the current availability status
  const { data: currentData, error: fetchError } = await supabase
    .from("deliverers")
    .select("is_available")
    .eq("id", id)
    .single();

  if (fetchError) throw new Error(fetchError.message);

  // Toggle the availability
  const { data, error } = await supabase
    .from("deliverers")
    .update({ is_available: !currentData.is_available })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
};

export const getAvailableDeliverersInZone = async (zone) => {
  const { data, error } = await supabase
    .from("deliverers")
    .select("*")
    .eq("is_available", true)
    .eq("zone", zone);

  if (error) throw new Error(error.message);
  return data;
};
