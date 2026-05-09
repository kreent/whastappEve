import { requireUser } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import ContactDetail from "@/components/ContactDetail";

export default async function ContactDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requireUser();
  return (
    <div className="h-screen flex bg-slate-50 overflow-hidden">
      <Sidebar user={user} />
      <main className="flex-1 overflow-y-auto p-6">
        <ContactDetail contactId={params.id} isAdmin={user.role === "admin"} />
      </main>
    </div>
  );
}
