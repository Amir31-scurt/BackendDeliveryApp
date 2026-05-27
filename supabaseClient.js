// PostgreSQL database connection (replaces Supabase)
// This file maintains backward compatibility by exporting 'supabase' as the database helper
const db = require("./dbHelper.js");

// Export as 'supabase' for backward compatibility
module.exports.supabase = db;
module.exports = db;
