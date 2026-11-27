-- CreateEnum
CREATE TYPE "AdmissionFeeStatus" AS ENUM ('NOT_PAID', 'PARTIAL_PAID', 'FULL_PAID', 'EXEMPTED', 'PENDING');

-- AlterTable
ALTER TABLE "BillCreditApplication" ADD COLUMN "billItemId" TEXT;

-- CreateTable
CREATE TABLE "AdmissionFeeAssessment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "feeStructureId" TEXT NOT NULL,
    "applicableAmount" DECIMAL(65,30) NOT NULL,
    "status" "AdmissionFeeStatus" NOT NULL,
    "historicalPaymentAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "historicalPaymentDate" TIMESTAMP(3),
    "historicalReference" TEXT,
    "historicalRemarks" TEXT,
    "exemptionReason" TEXT,
    "historicalCreditId" TEXT,
    "discountId" TEXT,
    "billId" TEXT,
    "billItemId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "correctedAt" TIMESTAMP(3),
    "correctedByUserId" TEXT,
    "correctionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdmissionFeeAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdmissionFeeAssessment_historicalCreditId_key" ON "AdmissionFeeAssessment"("historicalCreditId");

-- CreateIndex
CREATE UNIQUE INDEX "AdmissionFeeAssessment_discountId_key" ON "AdmissionFeeAssessment"("discountId");

-- CreateIndex
CREATE UNIQUE INDEX "AdmissionFeeAssessment_studentId_academicYearId_feeStructureId_key" ON "AdmissionFeeAssessment"("studentId", "academicYearId", "feeStructureId");

-- CreateIndex
CREATE INDEX "AdmissionFeeAssessment_studentId_idx" ON "AdmissionFeeAssessment"("studentId");
CREATE INDEX "AdmissionFeeAssessment_academicYearId_idx" ON "AdmissionFeeAssessment"("academicYearId");
CREATE INDEX "AdmissionFeeAssessment_feeStructureId_idx" ON "AdmissionFeeAssessment"("feeStructureId");
CREATE INDEX "AdmissionFeeAssessment_status_idx" ON "AdmissionFeeAssessment"("status");
CREATE INDEX "AdmissionFeeAssessment_billId_idx" ON "AdmissionFeeAssessment"("billId");
CREATE INDEX "BillCreditApplication_billItemId_idx" ON "BillCreditApplication"("billItemId");

-- AddForeignKey
ALTER TABLE "BillCreditApplication" ADD CONSTRAINT "BillCreditApplication_billItemId_fkey"
FOREIGN KEY ("billItemId") REFERENCES "BillItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AdmissionFeeAssessment" ADD CONSTRAINT "AdmissionFeeAssessment_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdmissionFeeAssessment" ADD CONSTRAINT "AdmissionFeeAssessment_academicYearId_fkey"
FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdmissionFeeAssessment" ADD CONSTRAINT "AdmissionFeeAssessment_feeStructureId_fkey"
FOREIGN KEY ("feeStructureId") REFERENCES "FeeStructure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdmissionFeeAssessment" ADD CONSTRAINT "AdmissionFeeAssessment_billId_fkey"
FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdmissionFeeAssessment" ADD CONSTRAINT "AdmissionFeeAssessment_historicalCreditId_fkey"
FOREIGN KEY ("historicalCreditId") REFERENCES "StudentCredit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdmissionFeeAssessment" ADD CONSTRAINT "AdmissionFeeAssessment_discountId_fkey"
FOREIGN KEY ("discountId") REFERENCES "StudentDiscount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdmissionFeeAssessment" ADD CONSTRAINT "AdmissionFeeAssessment_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdmissionFeeAssessment" ADD CONSTRAINT "AdmissionFeeAssessment_correctedByUserId_fkey"
FOREIGN KEY ("correctedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
