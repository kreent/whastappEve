-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
