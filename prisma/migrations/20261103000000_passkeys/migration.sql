-- Passkeys (WebAuthn credentials). Public key only; deleted with the user.
CREATE TABLE "authenticators" (
    "id" UUID NOT NULL,
    "credential_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "credential_public_key" TEXT NOT NULL,
    "counter" INTEGER NOT NULL,
    "credential_device_type" TEXT NOT NULL,
    "credential_backed_up" BOOLEAN NOT NULL,
    "transports" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "authenticators_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "authenticators_credential_id_key" ON "authenticators"("credential_id");
CREATE INDEX "authenticators_user_id_idx" ON "authenticators"("user_id");

ALTER TABLE "authenticators" ADD CONSTRAINT "authenticators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
