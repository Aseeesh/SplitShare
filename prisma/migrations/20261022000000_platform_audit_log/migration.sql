-- CreateTable
CREATE TABLE "platform_audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" VARCHAR(64) NOT NULL,
    "entity_type" VARCHAR(64) NOT NULL,
    "entity_id" VARCHAR(64),
    "before_json" JSONB,
    "after_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "platform_audit_logs_created_at_idx" ON "platform_audit_logs"("created_at");
CREATE INDEX "platform_audit_logs_entity_type_entity_id_idx" ON "platform_audit_logs"("entity_type", "entity_id");

ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Same append-only guarantee as audit_logs (§10).
CREATE TRIGGER platform_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON "platform_audit_logs"
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
