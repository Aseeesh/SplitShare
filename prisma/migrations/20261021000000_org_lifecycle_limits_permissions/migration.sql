-- CreateEnum
CREATE TYPE "HouseholdStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'SUSPENDED');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'HOUSEHOLD_ARCHIVED';
ALTER TYPE "AuditAction" ADD VALUE 'HOUSEHOLD_RESTORED';
ALTER TYPE "AuditAction" ADD VALUE 'HOUSEHOLD_SUSPENDED';
ALTER TYPE "AuditAction" ADD VALUE 'HOUSEHOLD_REACTIVATED';
ALTER TYPE "AuditAction" ADD VALUE 'MEMBER_LEFT';
ALTER TYPE "AuditAction" ADD VALUE 'MEMBER_ADDED';

-- AlterTable
ALTER TABLE "users" ADD COLUMN "max_households_override" INTEGER;
ALTER TABLE "households"
  ADD COLUMN "status" "HouseholdStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "archived_at" TIMESTAMP(3),
  ADD COLUMN "max_members_override" INTEGER;

-- An archived household must carry its archive time, or it could never be purged.
ALTER TABLE "households" ADD CONSTRAINT "households_archived_has_time"
  CHECK (status <> 'ARCHIVED' OR archived_at IS NOT NULL);

-- CreateIndex
CREATE INDEX "households_status_archived_at_idx" ON "households"("status", "archived_at");

-- CreateTable
CREATE TABLE "platform_settings" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "permission_overrides" (
    "role" "HouseholdRole" NOT NULL,
    "capability" VARCHAR(64) NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "permission_overrides_pkey" PRIMARY KEY ("role", "capability")
);

-- ---------------------------------------------------------------------------
-- Purge of archived households (§10 amendment)
--
-- The append-only triggers must still refuse every ordinary UPDATE/DELETE. The
-- one exception is the purge below, which switches on a transaction-local flag
-- only after verifying a household is ARCHIVED and past its retention window.
-- `set_config(..., true)` is local to the transaction, so the flag cannot leak
-- to any other statement or connection.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reject_mutation() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.purging_archived', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION
    '% is append-only: % is not permitted. Insert a reversal row instead.',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE OR REPLACE FUNCTION purge_expired_households(retention_days INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  purged INTEGER;
BEGIN
  PERFORM set_config('app.purging_archived', 'on', true);
  DELETE FROM "households"
   WHERE status = 'ARCHIVED'
     AND archived_at IS NOT NULL
     AND archived_at < now() - make_interval(days => retention_days);
  GET DIAGNOSTICS purged = ROW_COUNT;
  PERFORM set_config('app.purging_archived', 'off', true);
  RETURN purged;
END;
$$;
