import { prisma } from "../db/prisma.js";

const OPT_OUT_KEYWORDS = [
  "stop",
  "baja",
  "unsubscribe",
  "no recibir",
  "no enviar mas",
  "darme de baja",
  "remover",
  "remove me",
];

const OPT_IN_KEYWORDS = ["start", "alta", "subscribe", "reactivar"];

export const OPT_OUT_CONFIRM =
  "Listo. Ya no recibirás mensajes de marketing. Si cambias de idea, escribe ALTA para reactivarte.";
export const OPT_IN_CONFIRM =
  "¡Te reactivamos! Volverás a recibir nuestras comunicaciones.";

function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

export function isOptOutMessage(text: string | null | undefined): boolean {
  if (!text) return false;
  const n = normalize(text);
  return OPT_OUT_KEYWORDS.some((kw) => n === kw || n.includes(kw));
}

export function isOptInMessage(text: string | null | undefined): boolean {
  if (!text) return false;
  const n = normalize(text);
  return OPT_IN_KEYWORDS.some((kw) => n === kw);
}

export async function setContactOptOut(contactId: string, optedOut: boolean): Promise<void> {
  await prisma.contact.update({
    where: { id: contactId },
    data: {
      optedOut,
      optedOutAt: optedOut ? new Date() : null,
    },
  });
}
