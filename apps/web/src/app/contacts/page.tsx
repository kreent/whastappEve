import { requireUser } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import ContactsList from "@/components/ContactsList";

export default async function ContactsPage() {
  const user = await requireUser();
  return (
    <div className="h-screen flex bg-slate-50 overflow-hidden">
      <Sidebar user={user} />
      <main className="flex-1 overflow-y-auto p-6">
        <h1 className="text-xl font-semibold text-slate-900 mb-4">Clientes</h1>
        <ContactsList />
      </main>
    </div>
  );
}
