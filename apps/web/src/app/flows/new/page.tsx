"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

const TEMPLATE = {
  name: "Nuevo flujo",
  description: "",
  triggerType: "keyword",
  triggerValue: "nuevo",
  priority: 200,
  isActive: false,
  definition: {
    start: "message_1",
    nodes: {
      message_1: {
        id: "message_1",
        type: "message",
        text: "Hola, este es un nuevo flujo.",
      },
    },
  },
};

export default function NewFlowPage() {
  const router = useRouter();
  useEffect(() => {
    api<{ id: string }>("/api/flows", {
      method: "POST",
      body: JSON.stringify(TEMPLATE),
    })
      .then((created) => router.replace(`/flows/${created.id}/edit`))
      .catch(() => router.replace("/flows"));
  }, [router]);
  return (
    <div className="p-6 text-sm text-slate-400">
      Creando nuevo flujo...
    </div>
  );
}
