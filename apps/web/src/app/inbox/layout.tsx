import { requireUser } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import ConversationList from "@/components/ConversationList";

export default async function InboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  return (
    <div className="h-screen flex bg-slate-50 overflow-hidden">
      <Sidebar user={user} />
      <div className="w-80 border-r border-slate-200 bg-white flex flex-col">
        <div className="px-4 py-3 border-b border-slate-200">
          <div className="font-semibold text-sm text-slate-900">Conversaciones</div>
        </div>
        <ConversationList />
      </div>
      <main className="flex-1 flex min-w-0">{children}</main>
    </div>
  );
}
