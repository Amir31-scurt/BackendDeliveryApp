// PostgreSQL database connection (replaces Supabase)
// This file maintains backward compatibility by exporting 'supabase' as the database helper
import db, { query } from "./dbHelper.js";

// Export as 'supabase' for backward compatibility
export const supabase = db;

// Export raw query helper for complex SQL that the chained API doesn't support
export { query };
