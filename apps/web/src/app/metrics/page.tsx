import { requireUser } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import MetricsDashboard from "@/components/MetricsDashboard";

export default async function MetricsPage() {
  const user = await requireUser();
  return (
    <div className="h-screen flex bg-slate-50 overflow-hidden">
      <Sidebar user={user} />
      <main className="flex-1 overflow-y-auto p-6">
        <h1 className="text-xl font-semibold text-slate-900 mb-1">Métricas</h1>
        <p className="text-sm text-slate-500 mb-4">
          Volumen de mensajes, conversaciones por estado y tiempo de respuesta.
        </p>
        <MetricsDashboard />
      </main>
    </div>
  );
}
