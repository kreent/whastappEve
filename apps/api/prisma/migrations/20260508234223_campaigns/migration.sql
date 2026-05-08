-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('draft', 'queued', 'sending', 'completed', 'cancelled', 'failed');

-- CreateEnum
CREATE TYPE "CampaignRecipientStatus" AS ENUM ('pending', 'queued', 'sent', 'delivered', 'read', 'failed', 'skipped_opted_out');

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "opted_out" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "opted_out_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "template_id" UUID NOT NULL,
    "parameter_mapping" JSONB NOT NULL,
    "audience_filter" JSONB NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'draft',
    "total_recipients" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_recipients" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "resolved_params" JSONB NOT NULL,
    "status" "CampaignRecipientStatus" NOT NULL DEFAULT 'pending',
    "whatsapp_message_id" TEXT,
    "error_message" TEXT,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_recipients_whatsapp_message_id_key" ON "campaign_recipients"("whatsapp_message_id");

-- CreateIndex
CREATE INDEX "campaign_recipients_status_idx" ON "campaign_recipients"("status");

-- CreateIndex
CREATE INDEX "campaign_recipients_whatsapp_message_id_idx" ON "campaign_recipients"("whatsapp_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_recipients_campaign_id_contact_id_key" ON "campaign_recipients"("campaign_id", "contact_id");

-- CreateIndex
CREATE INDEX "contacts_opted_out_idx" ON "contacts"("opted_out");

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
