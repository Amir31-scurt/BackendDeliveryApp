// PostgreSQL database connection (replaces Supabase)
// This file maintains backward compatibility by exporting 'supabase' as the database helper
import db from "./dbHelper.js";

// Export as 'supabase' for backward compatibility
export const supabase = db;
