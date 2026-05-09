import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import SettingsTabs from "@/components/SettingsTabs";

export default async function SettingsPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/inbox");
  return (
    <div className="h-screen flex bg-slate-50 overflow-hidden">
      <Sidebar user={user} />
      <main className="flex-1 overflow-y-auto p-6">
        <h1 className="text-xl font-semibold text-slate-900 mb-1">Configuración</h1>
        <p className="text-sm text-slate-500 mb-4">
          Credenciales de WhatsApp y Telegram, horario de atención. Los cambios se aplican en
          minutos sin reiniciar.
        </p>
        <SettingsTabs />
      </main>
    </div>
  );
}
