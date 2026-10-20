-- CreateTable
CREATE TABLE "expense_funders" (
    "id" UUID NOT NULL,
    "expense_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "amount_cents" BIGINT NOT NULL,

    CONSTRAINT "expense_funders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expense_funders_user_id_idx" ON "expense_funders"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_funders_expense_id_user_id_key" ON "expense_funders"("expense_id", "user_id");

-- AddForeignKey
ALTER TABLE "expense_funders" ADD CONSTRAINT "expense_funders_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_funders" ADD CONSTRAINT "expense_funders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Backfill: every existing expense has exactly one funder — its payer, full amount.
-- ---------------------------------------------------------------------------
INSERT INTO "expense_funders" ("id", "expense_id", "user_id", "amount_cents")
SELECT gen_random_uuid(), "id", "paid_by_user_id", "amount_cents"
  FROM "expenses";

-- ---------------------------------------------------------------------------
-- Funder-sum invariant: SUM(expense_funders.amount_cents) == expenses.amount_cents,
-- asserted at COMMIT just like the split-sum trigger in §10.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION assert_expense_funders_balance() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  target_id     UUID;
  expense_total BIGINT;
  funders_total BIGINT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_id := CASE WHEN TG_TABLE_NAME = 'expenses' THEN OLD.id ELSE OLD.expense_id END;
  ELSE
    target_id := CASE WHEN TG_TABLE_NAME = 'expenses' THEN NEW.id ELSE NEW.expense_id END;
  END IF;

  SELECT amount_cents INTO expense_total FROM "expenses" WHERE id = target_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(amount_cents), 0)
    INTO funders_total
    FROM "expense_funders"
   WHERE expense_id = target_id;

  IF funders_total <> expense_total THEN
    RAISE EXCEPTION
      'expense % has funders summing to % but a total of %',
      target_id, funders_total, expense_total
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER expense_funders_sum_matches_expense
  AFTER INSERT OR UPDATE OR DELETE ON "expense_funders"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_expense_funders_balance();

CREATE CONSTRAINT TRIGGER expenses_have_funders
  AFTER INSERT OR UPDATE ON "expenses"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_expense_funders_balance();

-- ---------------------------------------------------------------------------
-- §12 balances now read "paid" from the funders, not the single payer column.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW "household_balances" AS
WITH countable AS (
  SELECT e.id, e.household_id, e.amount_cents
    FROM "expenses" e
   WHERE e.status IN ('ACCEPTED', 'PARTIALLY_PAID', 'PAID', 'LOCKED')
     AND e.reverses_expense_id IS NULL
),
paid AS (
  SELECT c.household_id, f.user_id, SUM(f.amount_cents) AS cents
    FROM "expense_funders" f
    JOIN countable c ON c.id = f.expense_id
   GROUP BY 1, 2
),
owed AS (
  SELECT c.household_id, s.user_id, SUM(s.amount_cents) AS cents
    FROM "expense_splits" s
    JOIN countable c ON c.id = s.expense_id
   WHERE s.acceptance = 'ACCEPTED'
   GROUP BY 1, 2
)
SELECT
  m.household_id,
  m.user_id,
  COALESCE(p.cents, 0)::BIGINT AS total_paid_cents,
  COALESCE(o.cents, 0)::BIGINT AS total_owed_cents,
  (COALESCE(p.cents, 0) - COALESCE(o.cents, 0))::BIGINT AS net_cents
FROM "household_members" m
LEFT JOIN paid p ON p.household_id = m.household_id AND p.user_id = m.user_id
LEFT JOIN owed o ON o.household_id = m.household_id AND o.user_id = m.user_id;
