-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "current_flow_id" UUID;

-- CreateTable
CREATE TABLE "flows" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "trigger_type" TEXT NOT NULL,
    "trigger_value" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "definition" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "flows_is_active_priority_idx" ON "flows"("is_active", "priority");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_current_flow_id_fkey" FOREIGN KEY ("current_flow_id") REFERENCES "flows"("id") ON DELETE SET NULL ON UPDATE CASCADE;
