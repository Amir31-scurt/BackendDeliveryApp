import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Supabase URL or Key is missing!");
  throw new Error(
    "Supabase URL and Key must be defined in environment variables."
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);



