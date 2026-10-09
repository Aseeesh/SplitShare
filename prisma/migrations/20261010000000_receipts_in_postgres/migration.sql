-- Receipts move out of R2 and into Postgres.
-- `pathname` was the R2 object key; with the bytes stored in the row it no
-- longer has any meaning. `data` holds the receipt bytes themselves (BYTEA).
ALTER TABLE "file_uploads" DROP COLUMN "pathname";
ALTER TABLE "file_uploads" ADD COLUMN "data" BYTEA NOT NULL;
