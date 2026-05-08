const KEYWORDS = [
  "agente",
  "humano",
  "asesor",
  "persona",
  "operador",
  "ayuda real",
  "hablar con alguien",
];

export function shouldHandoff(text: string | undefined | null): boolean {
  if (!text) return false;
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return KEYWORDS.some((kw) => normalized.includes(kw));
}
