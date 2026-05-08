import { requireUser } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import FlowsList from "@/components/FlowsList";

export default async function FlowsPage() {
  const user = await requireUser();
  return (
    <div className="h-screen flex bg-slate-50 overflow-hidden">
      <Sidebar user={user} />
      <main className="flex-1 overflow-y-auto p-6">
        <h1 className="text-xl font-semibold text-slate-900 mb-1">Flujos del bot</h1>
        <p className="text-sm text-slate-500 mb-4">
          Diseña flujos del chatbot con drag-and-drop. Al guardar, el motor empieza a usarlos para nuevas conversaciones.
        </p>
        <FlowsList />
      </main>
    </div>
  );
}
