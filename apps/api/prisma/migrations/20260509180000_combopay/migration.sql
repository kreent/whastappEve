-- AlterTable
ALTER TABLE "installments"
    ADD COLUMN "combopay_invoice_id" TEXT,
    ADD COLUMN "combopay_metadata" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "installments_combopay_invoice_id_key" ON "installments"("combopay_invoice_id");
