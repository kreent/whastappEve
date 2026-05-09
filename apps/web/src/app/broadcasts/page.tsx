import { requireUser } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import CampaignsList from "@/components/CampaignsList";

export default async function BroadcastsPage() {
  const user = await requireUser();
  return (
    <div className="h-screen flex bg-slate-50 overflow-hidden">
      <Sidebar user={user} />
      <main className="flex-1 overflow-y-auto p-6">
        <h1 className="text-xl font-semibold text-slate-900 mb-1">Campañas</h1>
        <p className="text-sm text-slate-500 mb-4">
          Envíos masivos a clientes usando plantillas aprobadas por Meta. Respeta opt-outs y rate limits.
        </p>
        <CampaignsList isAdmin={user.role === "admin"} />
      </main>
    </div>
  );
}
