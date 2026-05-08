import { requireUser } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import TemplatesList from "@/components/TemplatesList";

export default async function TemplatesPage() {
  const user = await requireUser();
  return (
    <div className="h-screen flex bg-slate-50 overflow-hidden">
      <Sidebar user={user} />
      <main className="flex-1 overflow-y-auto p-6">
        <h1 className="text-xl font-semibold text-slate-900 mb-1">Plantillas</h1>
        <p className="text-sm text-slate-500 mb-4">
          Mensajes pre-aprobados por Meta. Necesarios para iniciar conversaciones o cuando la ventana de 24h está cerrada.
        </p>
        <TemplatesList isAdmin={user.role === "admin"} />
      </main>
    </div>
  );
}
