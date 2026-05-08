import { requireUser } from "@/lib/auth";
import ChatView from "@/components/ChatView";

export default async function ConversationPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requireUser();
  return <ChatView conversationId={params.id} user={user} />;
}
