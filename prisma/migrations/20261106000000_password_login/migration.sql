-- Optional password sign-in, set by a signed-in user from their profile.
ALTER TABLE "users" ADD COLUMN "password_hash" TEXT;

-- A placeholder can never authenticate (§8a), so it can never hold a password.
ALTER TABLE "users"
  ADD CONSTRAINT "users_placeholder_no_password"
  CHECK (NOT is_placeholder OR password_hash IS NULL);
