import { requireUser } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import DebtsDashboard from "@/components/DebtsDashboard";

export default async function DebtsPage() {
  const user = await requireUser();
  return (
    <div className="h-screen flex bg-slate-50 overflow-hidden">
      <Sidebar user={user} />
      <main className="flex-1 overflow-y-auto p-6">
        <h1 className="text-xl font-semibold text-slate-900 mb-1">Cobranza</h1>
        <p className="text-sm text-slate-500 mb-4">
          Cuotas que vencen hoy, próximas y vencidas. El recordatorio automático
          corre todos los días a las 9 AM (hora Bogotá).
        </p>
        <DebtsDashboard isAdmin={user.role === "admin"} />
      </main>
    </div>
  );
}
