-- CreateEnum
CREATE TYPE "DebtStatus" AS ENUM ('active', 'paid', 'cancelled', 'overdue');

-- CreateEnum
CREATE TYPE "InstallmentStatus" AS ENUM ('pending', 'scheduled', 'sent', 'paid', 'overdue', 'failed');

-- CreateTable
CREATE TABLE "debts" (
    "id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "description" TEXT,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "installment_count" INTEGER NOT NULL,
    "payment_day_of_month" INTEGER NOT NULL,
    "first_due_date" DATE NOT NULL,
    "payment_link" TEXT,
    "template_id" UUID,
    "parameter_mapping" JSONB NOT NULL DEFAULT '[]',
    "status" "DebtStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "debts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installments" (
    "id" UUID NOT NULL,
    "debt_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "due_date" DATE NOT NULL,
    "status" "InstallmentStatus" NOT NULL DEFAULT 'pending',
    "reminder_sent_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "payment_link" TEXT,
    "whatsapp_message_id" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "installments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "debts_contact_id_idx" ON "debts"("contact_id");

-- CreateIndex
CREATE INDEX "debts_status_idx" ON "debts"("status");

-- CreateIndex
CREATE INDEX "installments_status_due_date_idx" ON "installments"("status", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "installments_debt_id_number_key" ON "installments"("debt_id", "number");

-- AddForeignKey
ALTER TABLE "debts" ADD CONSTRAINT "debts_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debts" ADD CONSTRAINT "debts_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installments" ADD CONSTRAINT "installments_debt_id_fkey" FOREIGN KEY ("debt_id") REFERENCES "debts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
