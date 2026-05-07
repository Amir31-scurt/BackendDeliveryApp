-- Migration 005: Add user data columns to the otps table
-- This replaces the in-memory userStore that was wiped on every server restart.
-- User registration data (name, hashed password, etc.) is now stored in the DB
-- alongside the OTP and cleaned up after successful verification.

ALTER TABLE otps
  ADD COLUMN IF NOT EXISTS user_name        TEXT,
  ADD COLUMN IF NOT EXISTS user_password    TEXT,
  ADD COLUMN IF NOT EXISTS user_role        TEXT DEFAULT 'customer',
  ADD COLUMN IF NOT EXISTS profile_picture  TEXT;
