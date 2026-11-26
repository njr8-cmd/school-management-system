BEGIN;

ALTER TABLE "TeacherSalaryPayment"
ADD COLUMN "recordedByUserId" TEXT,
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "idempotencyRequestHash" TEXT;

ALTER TABLE "Expense"
ADD COLUMN "voidedAt" TIMESTAMP(3),
ADD COLUMN "voidReason" TEXT,
ADD COLUMN "voidedByUserId" TEXT;

CREATE UNIQUE INDEX "TeacherSalaryPayment_idempotencyKey_key"
ON "TeacherSalaryPayment"("idempotencyKey");

CREATE INDEX "TeacherSalaryPayment_recordedByUserId_idx"
ON "TeacherSalaryPayment"("recordedByUserId");

CREATE INDEX "Expense_voidedAt_idx"
ON "Expense"("voidedAt");

CREATE INDEX "Expense_voidedByUserId_idx"
ON "Expense"("voidedByUserId");

ALTER TABLE "TeacherSalaryPayment"
ADD CONSTRAINT "TeacherSalaryPayment_recordedByUserId_fkey"
FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Expense"
ADD CONSTRAINT "Expense_voidedByUserId_fkey"
FOREIGN KEY ("voidedByUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TeacherSalaryPayment"
ADD CONSTRAINT "TeacherSalaryPayment_idempotency_pair_check"
CHECK (
  ("idempotencyKey" IS NULL AND "idempotencyRequestHash" IS NULL)
  OR
  (
    "idempotencyKey" IS NOT NULL
    AND "idempotencyRequestHash" IS NOT NULL
    AND "recordedByUserId" IS NOT NULL
  )
) NOT VALID;

ALTER TABLE "Expense"
ADD CONSTRAINT "Expense_void_audit_check"
CHECK (
  ("voidedAt" IS NULL AND "voidReason" IS NULL AND "voidedByUserId" IS NULL)
  OR
  (
    "voidedAt" IS NOT NULL
    AND "voidReason" IS NOT NULL
    AND length(trim("voidReason")) > 0
    AND "voidedByUserId" IS NOT NULL
  )
) NOT VALID;

COMMIT;
