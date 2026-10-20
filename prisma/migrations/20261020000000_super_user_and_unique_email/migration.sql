-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'USER_DISABLED';
ALTER TYPE "AuditAction" ADD VALUE 'USER_ENABLED';

-- AlterTable
ALTER TABLE "users" ADD COLUMN "is_super_user" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "disabled_at" TIMESTAMP(3);

-- One person, one account: "Ann@x.com" and "ann@x.com" are the same address.
-- The existing unique index is case-sensitive, so this closes the gap.
CREATE UNIQUE INDEX "users_email_lower_key" ON "users" (lower("email"));
