const {createClient} = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_KEY;

module.exports.supabase = createClient(supabaseUrl, supabaseAnonKey);

// Helper functions for each table
module.exports.deliverersTable = {
  getAll: () => supabase.from("deliverers").select("*"),
  getById: (id) =>
    supabase.from("deliverers").select("*").eq("id", id).single(),
  create: (deliverer) => supabase.from("deliverers").insert(deliverer),
  update: (id, updates) =>
    supabase.from("deliverers").update(updates).eq("id", id),
  delete: (id) => supabase.from("deliverers").delete().eq("id", id),
};

module.exports.usersTable = {
  getAll: () => supabase.from("users").select("*"),
  getById: (id) => supabase.from("users").select("*").eq("id", id).single(),
  create: (user) => supabase.from("users").insert(user),
  update: (id, updates) => supabase.from("users").update(updates).eq("id", id),
  delete: (id) => supabase.from("users").delete().eq("id", id),
};

module.exports.restaurantsTable = {
  getAll: () => supabase.from("restaurants").select("*"),
  getById: (id) =>
    supabase.from("restaurants").select("*").eq("id", id).single(),
  create: (restaurant) => supabase.from("restaurants").insert(restaurant),
  update: (id, updates) =>
    supabase.from("restaurants").update(updates).eq("id", id),
  delete: (id) => supabase.from("restaurants").delete().eq("id", id),
};

module.exports.menuItemsTable = {
  getAll: () => supabase.from("menu_items").select("*"),
  getById: (id) =>
    supabase.from("menu_items").select("*").eq("id", id).single(),
  create: (menuItem) => supabase.from("menu_items").insert(menuItem),
  update: (id, updates) =>
    supabase.from("menu_items").update(updates).eq("id", id),
  delete: (id) => supabase.from("menu_items").delete().eq("id", id),
};

module.exports.ordersTable = {
  getAll: () => supabase.from("orders").select("*"),
  getById: (id) => supabase.from("orders").select("*").eq("id", id).single(),
  create: (order) => supabase.from("orders").insert(order),
  update: (id, updates) => supabase.from("orders").update(updates).eq("id", id),
  delete: (id) => supabase.from("orders").delete().eq("id", id),
};

module.exports.reviewsTable = {
  getAll: () => supabase.from("reviews").select("*"),
  getById: (id) => supabase.from("reviews").select("*").eq("id", id).single(),
  create: (review) => supabase.from("reviews").insert(review),
  update: (id, updates) =>
    supabase.from("reviews").update(updates).eq("id", id),
  delete: (id) => supabase.from("reviews").delete().eq("id", id),
};
