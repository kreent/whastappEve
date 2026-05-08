import { prisma } from "../../db/prisma.js";

export interface BusinessHoursConfig {
  enabled: boolean;
  timezone: string;
  // 0=Sunday, 6=Saturday
  schedule: Array<{ weekday: number; openMinute: number; closeMinute: number }>;
  awayMessage: string;
}

const DEFAULT_AWAY_MESSAGE =
  "¡Gracias por escribirnos! En este momento estamos fuera de horario. " +
  "Te respondemos apenas iniciemos la jornada (lun-vie 9:00-18:00).";

export const DEFAULT_BUSINESS_HOURS: BusinessHoursConfig = {
  enabled: true,
  timezone: "America/Bogota",
  schedule: [
    { weekday: 1, openMinute: 9 * 60, closeMinute: 18 * 60 },
    { weekday: 2, openMinute: 9 * 60, closeMinute: 18 * 60 },
    { weekday: 3, openMinute: 9 * 60, closeMinute: 18 * 60 },
    { weekday: 4, openMinute: 9 * 60, closeMinute: 18 * 60 },
    { weekday: 5, openMinute: 9 * 60, closeMinute: 18 * 60 },
  ],
  awayMessage: DEFAULT_AWAY_MESSAGE,
};

export async function getBusinessHours(): Promise<BusinessHoursConfig> {
  const row = await prisma.setting.findUnique({ where: { key: "business_hours" } });
  if (!row) return DEFAULT_BUSINESS_HOURS;
  return { ...DEFAULT_BUSINESS_HOURS, ...(row.value as Partial<BusinessHoursConfig>) };
}

export function isWithinHours(config: BusinessHoursConfig, now: Date = new Date()): boolean {
  if (!config.enabled) return true;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: config.timezone,
    hourCycle: "h23",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const weekdayName = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const weekday = weekdayMap[weekdayName] ?? 0;
  const minutesNow = hour * 60 + minute;

  return config.schedule.some(
    (s) => s.weekday === weekday && minutesNow >= s.openMinute && minutesNow < s.closeMinute,
  );
}
