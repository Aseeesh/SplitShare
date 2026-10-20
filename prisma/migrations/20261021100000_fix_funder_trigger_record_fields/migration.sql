-- Fix: `assert_expense_funders_balance` failed on every write to "expenses" with
--   record "new" has no field "expense_id"
--
-- PL/pgSQL plans the whole of a CASE expression, so `NEW.expense_id` was
-- resolved even for the expenses table, which has no such column. Choosing the
-- branch with IF statements means only the field that exists is ever touched.
CREATE OR REPLACE FUNCTION assert_expense_funders_balance() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  target_id     UUID;
  expense_total BIGINT;
  funders_total BIGINT;
BEGIN
  IF TG_TABLE_NAME = 'expenses' THEN
    IF TG_OP = 'DELETE' THEN
      target_id := OLD.id;
    ELSE
      target_id := NEW.id;
    END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN
      target_id := OLD.expense_id;
    ELSE
      target_id := NEW.expense_id;
    END IF;
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
