import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { audit } from "../services/auth/audit.js";

const flowDefinitionSchema = z
  .object({
    start: z.string().min(1),
    nodes: z.record(z.string(), z.record(z.unknown())),
  })
  .refine((d) => d.start in d.nodes, {
    message: "definition.start must reference an existing node",
  });

const createFlowSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  triggerType: z.enum(["default", "keyword", "intent"]),
  triggerValue: z.string().optional(),
  priority: z.number().int().nonnegative().default(100),
  isActive: z.boolean().default(true),
  definition: flowDefinitionSchema,
});

const updateFlowSchema = createFlowSchema.partial();

export async function flowRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/flows", { preHandler: requireAuth }, async () => {
    return prisma.flow.findMany({
      orderBy: [{ isActive: "desc" }, { priority: "asc" }, { createdAt: "asc" }],
    });
  });

  app.get<{ Params: { id: string } }>(
    "/api/flows/:id",
    { preHandler: requireAuth },
    async (req, reply) => {
      const flow = await prisma.flow.findUnique({ where: { id: req.params.id } });
      if (!flow) {
        reply.code(404).send({ error: "not_found" });
        return;
      }
      reply.send(flow);
    },
  );

  app.post("/api/flows", { preHandler: requireAdmin }, async (req, reply) => {
    const parsed = createFlowSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
      return;
    }
    const flow = await prisma.flow.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        triggerType: parsed.data.triggerType,
        triggerValue: parsed.data.triggerValue,
        priority: parsed.data.priority,
        isActive: parsed.data.isActive,
        definition: parsed.data.definition as object,
      },
    });
    await audit({
      userId: req.user!.id,
      action: "flow.created",
      entityType: "flow",
      entityId: flow.id,
    });
    reply.code(201).send(flow);
  });

  app.put<{ Params: { id: string } }>(
    "/api/flows/:id",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const parsed = updateFlowSchema.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
        return;
      }
      const flow = await prisma.flow.update({
        where: { id: req.params.id },
        data: {
          ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
          ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
          ...(parsed.data.triggerType !== undefined ? { triggerType: parsed.data.triggerType } : {}),
          ...(parsed.data.triggerValue !== undefined ? { triggerValue: parsed.data.triggerValue } : {}),
          ...(parsed.data.priority !== undefined ? { priority: parsed.data.priority } : {}),
          ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
          ...(parsed.data.definition !== undefined
            ? { definition: parsed.data.definition as object }
            : {}),
        },
      });
      await audit({
        userId: req.user!.id,
        action: "flow.updated",
        entityType: "flow",
        entityId: flow.id,
      });
      reply.send(flow);
    },
  );
}
