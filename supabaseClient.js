import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const supabaseUrl = "https://omhzhgowylojwknlmrqp.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9taHpoZ293eWxvandrbmxtcnFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzU0Nzk1OTYsImV4cCI6MjA1MTA1NTU5Nn0.09iaLH4V7PWLjk0hGVx7PjjMZ_gjRNxYuIAfSevjTms";

if (!supabaseUrl || !supabaseKey) {
  console.error("Supabase URL or Key is missing!");
  throw new Error(
    "Supabase URL and Key must be defined in environment variables."
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);
