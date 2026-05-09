-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('whatsapp', 'telegram');

-- AlterTable
ALTER TABLE "contacts"
    ADD COLUMN "telegram_chat_id" TEXT,
    ADD COLUMN "telegram_username" TEXT,
    ADD COLUMN "preferred_channel" "Channel" NOT NULL DEFAULT 'whatsapp';

-- CreateIndex
CREATE UNIQUE INDEX "contacts_telegram_chat_id_key" ON "contacts"("telegram_chat_id");
CREATE INDEX "contacts_preferred_channel_idx" ON "contacts"("preferred_channel");
