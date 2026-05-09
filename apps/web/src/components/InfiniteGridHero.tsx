"use client";

import React, { useRef } from "react";
import Link from "next/link";
import {
  motion,
  useMotionValue,
  useTransform,
  useMotionTemplate,
  useAnimationFrame,
} from "framer-motion";

export function InfiniteGridHero() {
  const containerRef = useRef<HTMLDivElement>(null);

  const mouseX = useMotionValue(-1000);
  const mouseY = useMotionValue(-1000);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const { left, top } = e.currentTarget.getBoundingClientRect();
    mouseX.set(e.clientX - left);
    mouseY.set(e.clientY - top);
  };

  const gridOffsetX = useMotionValue(0);
  const gridOffsetY = useMotionValue(0);

  useAnimationFrame(() => {
    gridOffsetX.set((gridOffsetX.get() + 0.12) % 40);
    gridOffsetY.set((gridOffsetY.get() + 0.12) % 40);
  });

  const maskImage = useMotionTemplate`radial-gradient(320px circle at ${mouseX}px ${mouseY}px, black, transparent)`;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="relative w-full min-h-[88vh] flex flex-col items-center justify-center overflow-hidden bg-black text-white"
    >
      {/* base grid */}
      <div className="absolute inset-0 z-0 opacity-[0.08] text-emerald-400">
        <GridPattern offsetX={gridOffsetX} offsetY={gridOffsetY} />
      </div>

      {/* grid revealed by cursor */}
      <motion.div
        className="absolute inset-0 z-0 opacity-90 text-emerald-400"
        style={{ maskImage, WebkitMaskImage: maskImage }}
      >
        <GridPattern offsetX={gridOffsetX} offsetY={gridOffsetY} />
      </motion.div>

      {/* glows */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute right-[-20%] top-[-20%] w-[45%] h-[45%] rounded-full bg-emerald-500/30 blur-[140px]" />
        <div className="absolute right-[10%] top-[-10%] w-[20%] h-[20%] rounded-full bg-emerald-400/25 blur-[100px]" />
        <div className="absolute left-[-10%] bottom-[-20%] w-[40%] h-[40%] rounded-full bg-emerald-600/25 blur-[140px]" />
      </div>

      {/* content */}
      <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-3xl mx-auto space-y-7 pointer-events-none py-20">
        <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium px-3 py-1 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Conecta. Envía. Comunica.
        </div>

        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.05] drop-shadow-sm">
          Atiende, vende y cobra por{" "}
          <span className="text-emerald-400">WhatsApp y Telegram</span>{" "}
          sin perder mensajes ni clientes.
        </h1>

        <p className="text-base md:text-lg text-slate-300 max-w-2xl leading-relaxed">
          EveGate junta tu chatbot, tu equipo de atención y tu cobranza
          automatizada en un solo lugar. Reemplaza WATI o Respond.io, vive en
          tu infraestructura y se adapta a tu negocio.
        </p>

        <div className="flex gap-3 flex-wrap justify-center pointer-events-auto">
          <Link
            href="/login"
            className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-md text-sm transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
          >
            Entrar al dashboard
          </Link>
          <a
            href="#funcionalidades"
            className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/15 text-white font-semibold rounded-md text-sm transition-all active:scale-95"
          >
            Ver funcionalidades
          </a>
        </div>
      </div>
    </div>
  );
}

function GridPattern({
  offsetX,
  offsetY,
}: {
  offsetX: ReturnType<typeof useMotionValue<number>>;
  offsetY: ReturnType<typeof useMotionValue<number>>;
}) {
  return (
    <svg className="w-full h-full">
      <defs>
        <motion.pattern
          id="grid-pattern"
          width="40"
          height="40"
          patternUnits="userSpaceOnUse"
          x={offsetX}
          y={offsetY}
        >
          <path
            d="M 40 0 L 0 0 0 40"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
          />
        </motion.pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid-pattern)" />
    </svg>
  );
}
