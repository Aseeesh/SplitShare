-- CreateEnum
CREATE TYPE "RecurrenceFrequency" AS ENUM ('WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'YEARLY');

-- CreateTable
CREATE TABLE "recurring_expenses" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "category_id" UUID,
    "paid_by_user_id" UUID NOT NULL,
    "split_method" "SplitMethod" NOT NULL,
    "frequency" "RecurrenceFrequency" NOT NULL,
    "next_run_at" DATE NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recurring_expenses_household_id_next_run_at_idx" ON "recurring_expenses"("household_id", "next_run_at");

-- AddForeignKey
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_paid_by_user_id_fkey" FOREIGN KEY ("paid_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
