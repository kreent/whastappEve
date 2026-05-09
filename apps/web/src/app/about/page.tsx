import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "EveGate · Atención multicanal y cobranza automatizada",
  description:
    "Plataforma para atender clientes por WhatsApp y Telegram, con chatbot, campañas masivas y cobranza automatizada con link de pago.",
};

const FEATURES: Array<{ title: string; body: string }> = [
  {
    title: "Multicanal en una bandeja",
    body:
      "Atiende WhatsApp Business y Telegram desde la misma vista. Cada cliente tiene su canal preferido y los mensajes salen por donde corresponde.",
  },
  {
    title: "Chatbot configurable sin código",
    body:
      "Diseña flujos con un editor visual drag-and-drop: mensajes, preguntas, condiciones, botones interactivos, derivar a humano. Cambia el flujo en 30 segundos sin tocar código.",
  },
  {
    title: "Bandeja tipo Intercom",
    body:
      "Tu equipo ve las conversaciones a la izquierda, el chat al centro, y la ficha del cliente a la derecha. Asignación, notas internas, etiquetas.",
  },
  {
    title: "Cobranza automatizada",
    body:
      "Asigna créditos con N cuotas. El día del vencimiento, a las 9 AM, sale automático un recordatorio con un link de pago único. Cuando paga, el sistema lo confirma solo.",
  },
  {
    title: "Campañas masivas",
    body:
      "Importa contactos por CSV, segmenta por etiquetas, y envía plantillas pre-aprobadas con variables personalizadas. Rate-limit + opt-out automático para cumplir con Meta.",
  },
  {
    title: "Plantillas con Meta",
    body:
      "Crea plantillas, envíalas a aprobación de Meta, sincroniza el estado, y úsalas para mensajes fuera de la ventana de 24 horas.",
  },
  {
    title: "Métricas en vivo",
    body:
      "Mensajes diarios, % resueltos por bot, tiempo de primera respuesta, conversaciones por estado. Saber qué tan bien están atendiendo tus agentes y tu bot.",
  },
  {
    title: "Privado, tuyo, controlable",
    body:
      "Todo corre en tu infraestructura: tus credenciales, tu base de datos, tus reglas. No es SaaS opaco — es tuyo.",
  },
];

const STEPS = [
  {
    n: 1,
    title: "Conecta tus canales",
    body:
      "Pega tus credenciales de WhatsApp Cloud API y/o el token de tu bot de Telegram. Configura el horario de atención y el mensaje de ausencia.",
  },
  {
    n: 2,
    title: "Diseña el bot que atiende",
    body:
      "Con el editor visual, define el saludo, el menú, las preguntas frecuentes y cuándo deriva a un humano. Sin código, sin desarrolladores.",
  },
  {
    n: 3,
    title: "Carga tus clientes",
    body:
      "Sube un CSV con teléfonos y nombres. O deja que el bot los registre automáticamente cuando te escriben por primera vez.",
  },
  {
    n: 4,
    title: "Cobra y comunica sin esfuerzo",
    body:
      "Asigna créditos con sus cuotas, lanza campañas, marca como pagado, todo desde el mismo dashboard. Tu equipo solo atiende cuando el bot deriva.",
  },
];

const FOR_WHO = [
  "Empresas de financiamiento y crédito que envían recordatorios mensuales de cuotas.",
  "Tiendas y servicios que reciben muchos pedidos / consultas por WhatsApp.",
  "Equipos de soporte que necesitan repartir conversaciones entre varios agentes.",
  "Negocios que quieren hacer marketing por WhatsApp sin que los bloqueen.",
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Top nav */}
      <header className="bg-black border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="EveGate" className="h-8 w-auto" />
          </div>
          <Link
            href="/login"
            className="text-sm bg-emerald-500 hover:bg-emerald-400 text-black font-medium px-4 py-2 rounded-md"
          >
            Iniciar sesión
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 py-16 sm:py-20 grid lg:grid-cols-2 gap-10 items-center">
        <div>
          <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 text-xs font-medium px-3 py-1 rounded-full mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Conecta. Envía. Comunica.
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight mb-5">
            Atiende, vende y cobra por{" "}
            <span className="text-emerald-600">WhatsApp y Telegram</span>{" "}
            sin perder mensajes ni clientes.
          </h1>
          <p className="text-lg text-slate-600 mb-7 leading-relaxed">
            EveGate junta tu chatbot, tu equipo de atención y tu cobranza
            automatizada en un solo lugar. Reemplaza herramientas como WATI o
            Respond.io, vive en tu infraestructura y se adapta a tu negocio.
          </p>
          <div className="flex gap-3 flex-wrap">
            <Link
              href="/login"
              className="bg-slate-900 hover:bg-slate-800 text-white font-medium px-5 py-3 rounded-md text-sm"
            >
              Entrar al dashboard
            </Link>
            <a
              href="#funcionalidades"
              className="border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium px-5 py-3 rounded-md text-sm"
            >
              Ver funcionalidades
            </a>
          </div>
        </div>
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/login.png"
            alt="EveGate dashboard"
            className="rounded-2xl shadow-xl border border-slate-200 w-full"
          />
        </div>
      </section>

      {/* Features */}
      <section id="funcionalidades" className="bg-black text-white border-y border-slate-800">
        <div className="max-w-6xl mx-auto px-6 py-16 sm:py-20">
          <div className="text-center mb-12 max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold mb-3">
              Todo lo que necesitas en un{" "}
              <span className="text-emerald-400">solo dashboard</span>
            </h2>
            <p className="text-slate-300">
              Sin saltar entre 5 herramientas. Sin pegar y copiar números entre
              hojas de cálculo. Sin perder de vista una conversación importante.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-xl p-5 transition"
              >
                <h3 className="font-semibold mb-1.5 text-emerald-400">{f.title}</h3>
                <p className="text-sm text-slate-300 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-6 py-16 sm:py-20">
        <div className="text-center mb-12 max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold mb-3">Cómo funciona</h2>
          <p className="text-slate-600">
            Cuatro pasos para tener tu canal de WhatsApp atendido por un bot
            entrenado a tu negocio y un equipo humano para lo que lo necesite.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {STEPS.map((s) => (
            <div key={s.n} className="relative">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-full bg-emerald-500 text-white font-bold flex items-center justify-center">
                  {s.n}
                </div>
                <h3 className="font-semibold text-slate-900">{s.title}</h3>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* For who */}
      <section className="bg-slate-900 text-white">
        <div className="max-w-6xl mx-auto px-6 py-16 sm:py-20 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl font-bold mb-4">¿Es para ti?</h2>
            <p className="text-slate-300 leading-relaxed mb-6">
              EveGate fue construido pensando en negocios que necesitan
              comunicarse a escala con sus clientes y mantener todo organizado,
              auditado y bajo su control.
            </p>
            <ul className="space-y-2.5">
              {FOR_WHO.map((p) => (
                <li key={p} className="flex gap-3 items-start text-sm text-slate-200">
                  <span className="text-emerald-400 mt-0.5">✓</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-slate-800 rounded-2xl p-8 border border-slate-700">
            <div className="text-xs uppercase tracking-wider text-emerald-400 mb-2">
              Caso típico
            </div>
            <p className="text-slate-200 leading-relaxed mb-4">
              Un fondo de empleados con 500 colaboradores asigna créditos por
              empleado en EveGate. Cada mes, el sistema manda automáticamente
              un recordatorio con un link de pago de ComboPay vía WhatsApp.
            </p>
            <p className="text-slate-300 text-sm leading-relaxed">
              Cuando el empleado paga, EveGate marca la cuota como pagada
              y le manda un mensaje de gracias. Cero cobranza manual, cero
              hojas de Excel.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-3xl mx-auto px-6 py-16 sm:py-20 text-center">
        <h2 className="text-3xl font-bold mb-3">Listo para empezar</h2>
        <p className="text-slate-600 mb-7 leading-relaxed">
          Inicia sesión con tu cuenta de admin o pídele a tu equipo el acceso.
        </p>
        <Link
          href="/login"
          className="inline-block bg-slate-900 hover:bg-slate-800 text-white font-medium px-6 py-3 rounded-md text-sm"
        >
          Iniciar sesión
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between text-xs text-slate-500">
          <span>© {new Date().getFullYear()} EveGate</span>
          <div className="flex gap-4">
            <Link href="/login" className="hover:text-slate-900">
              Iniciar sesión
            </Link>
            <a href="#funcionalidades" className="hover:text-slate-900">
              Funcionalidades
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
