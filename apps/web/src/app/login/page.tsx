"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      router.replace("/inbox");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Email o contraseña incorrectos.");
      } else {
        setError("Ocurrió un error. Intenta de nuevo.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-white">
      <div className="flex-1 flex flex-col justify-center px-8 sm:px-16 lg:px-24 max-w-2xl w-full">
        <div className="w-full max-w-sm mx-auto">
          <h1 className="text-3xl font-bold text-slate-900 mb-1">Bienvenidos a EveGate</h1>
          <p className="text-sm text-slate-500 mb-10">Inicia sesión para continuar</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="email@ejemplo.com"
                className="w-full px-3 py-2.5 border border-slate-300 rounded-md text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••••"
                className="w-full px-3 py-2.5 border border-slate-300 rounded-md text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
              />
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                />
                Recordarme
              </label>
              <button
                type="button"
                className="text-slate-700 hover:text-slate-900 hover:underline"
                onClick={() => alert("Recuperación de contraseña próximamente.")}
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>

            {error && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2.5">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-medium py-3 px-4 rounded-md text-sm transition"
            >
              {loading ? "Ingresando..." : "Continuar"}
            </button>
          </form>

          <p className="text-sm text-slate-600 mt-8 text-center">
            ¿No tienes una cuenta?{" "}
            <button
              onClick={() => alert("Registro próximamente. Contacta al admin.")}
              className="font-semibold text-slate-900 hover:underline"
            >
              Crea una aquí.
            </button>
          </p>
        </div>
      </div>

      <div
        className="hidden lg:block flex-1 bg-cover bg-no-repeat"
        style={{ backgroundImage: "url(/login.png)", backgroundPosition: "top" }}
        aria-hidden
      />
    </div>
  );
}
