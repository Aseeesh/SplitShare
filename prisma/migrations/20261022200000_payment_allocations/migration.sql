-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "expense_split_id" UUID NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_allocations_amount_positive" CHECK ("amount_cents" > 0)
);

CREATE UNIQUE INDEX "payment_allocations_payment_id_expense_split_id_key"
  ON "payment_allocations"("payment_id", "expense_split_id");
CREATE INDEX "payment_allocations_expense_split_id_idx" ON "payment_allocations"("expense_split_id");

ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_expense_split_id_fkey"
  FOREIGN KEY ("expense_split_id") REFERENCES "expense_splits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Append-only, like the payments they describe (§10). The retention purge may
-- still remove them with their household (see reject_mutation()).
CREATE TRIGGER payment_allocations_immutable
  BEFORE UPDATE OR DELETE ON "payment_allocations"
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
