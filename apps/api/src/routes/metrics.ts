import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.js";

interface DailyRow {
  day: Date;
  inbound: bigint;
  outbound: bigint;
}

interface ResponseTimeRow {
  avg_seconds: number | null;
}

interface DirectionGroup {
  direction: string;
  _count: { _all: number };
}

interface StatusGroup {
  status: string;
  _count: { _all: number };
}

export async function metricsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/metrics/dashboard",
    { preHandler: requireAuth },
    async (req) => {
      const days = Math.min(
        Math.max(Number((req.query as { days?: string }).days) || 14, 1),
        90,
      );
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const [
        totals,
        statusCounts,
        botResolved,
        humanResolved,
        contactsTotal,
        contactsRecent,
        daily,
        responseTime,
      ] = await Promise.all([
        prisma.message.groupBy({
          by: ["direction"],
          where: { createdAt: { gte: since } },
          _count: { _all: true },
        }),
        prisma.conversation.groupBy({
          by: ["status"],
          _count: { _all: true },
        }),
        prisma.conversation.count({
          where: {
            status: "resolved",
            updatedAt: { gte: since },
            messages: { every: { OR: [{ direction: "inbound" }, { sentBy: "bot" }] } },
          },
        }),
        prisma.conversation.count({
          where: {
            status: "resolved",
            updatedAt: { gte: since },
            messages: { some: { direction: "outbound", sentBy: { not: "bot" } } },
          },
        }),
        prisma.contact.count(),
        prisma.contact.count({ where: { createdAt: { gte: since } } }),
        prisma.$queryRaw<DailyRow[]>`
          SELECT
            date_trunc('day', created_at) AS day,
            COUNT(*) FILTER (WHERE direction = 'inbound') AS inbound,
            COUNT(*) FILTER (WHERE direction = 'outbound') AS outbound
          FROM messages
          WHERE created_at >= ${since}
          GROUP BY day
          ORDER BY day ASC
        `,
        prisma.$queryRaw<ResponseTimeRow[]>`
          WITH inbound_with_next AS (
            SELECT
              m.conversation_id,
              m.created_at AS in_time,
              (
                SELECT MIN(o.created_at)
                FROM messages o
                WHERE o.conversation_id = m.conversation_id
                  AND o.direction = 'outbound'
                  AND o.sent_by IS NOT NULL
                  AND o.sent_by != 'bot'
                  AND o.created_at > m.created_at
              ) AS out_time
            FROM messages m
            WHERE m.direction = 'inbound'
              AND m.created_at >= ${since}
          )
          SELECT AVG(EXTRACT(EPOCH FROM (out_time - in_time))) AS avg_seconds
          FROM inbound_with_next
          WHERE out_time IS NOT NULL
        `,
      ]);

      const totalsTyped = totals as unknown as DirectionGroup[];
      const statusTyped = statusCounts as unknown as StatusGroup[];
      const inboundTotal = Number(
        totalsTyped.find((t: DirectionGroup) => t.direction === "inbound")?._count._all ?? 0,
      );
      const outboundTotal = Number(
        totalsTyped.find((t: DirectionGroup) => t.direction === "outbound")?._count._all ?? 0,
      );
      const totalResolved = botResolved + humanResolved;

      return {
        windowDays: days,
        totals: { inbound: inboundTotal, outbound: outboundTotal },
        statusBreakdown: statusTyped.map((s: StatusGroup) => ({
          status: s.status,
          count: s._count._all,
        })),
        resolution: {
          totalResolved,
          byBot: botResolved,
          byHuman: humanResolved,
          botShare: totalResolved === 0 ? 0 : botResolved / totalResolved,
        },
        contacts: { total: contactsTotal, newInWindow: contactsRecent },
        avgFirstResponseSeconds: responseTime[0]?.avg_seconds ?? null,
        daily: daily.map((d: DailyRow) => ({
          day: new Date(d.day).toISOString().slice(0, 10),
          inbound: Number(d.inbound),
          outbound: Number(d.outbound),
        })),
      };
    },
  );
}
