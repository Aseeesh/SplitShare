-- Outcome of each invitation email, so a delivery failure is visible after the
-- (short-lived) runtime logs are gone.
ALTER TYPE "AuditAction" ADD VALUE 'INVITATION_EMAIL_SENT';
ALTER TYPE "AuditAction" ADD VALUE 'INVITATION_EMAIL_FAILED';
