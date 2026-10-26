-- Quick mode: per-household switch for the split acceptance step (§8).
-- Existing households keep requiring acceptance.
ALTER TABLE "households" ADD COLUMN "require_acceptance" BOOLEAN NOT NULL DEFAULT true;
