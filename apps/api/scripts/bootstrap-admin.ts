// Idempotent admin bootstrap. Reads BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD
// from env. If a user with that email exists, it does nothing. If not, creates an admin.
// Also seeds the default welcome flow if missing.
//
// Run from Railway shell after deploy:
//   BOOTSTRAP_ADMIN_EMAIL=you@example.com BOOTSTRAP_ADMIN_PASSWORD=strong-pwd npm run bootstrap:admin

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !password) {
    console.error("Missing BOOTSTRAP_ADMIN_EMAIL or BOOTSTRAP_ADMIN_PASSWORD env");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("BOOTSTRAP_ADMIN_PASSWORD must be at least 8 chars");
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`admin already exists: ${email} (id=${existing.id})`);
  } else {
    const user = await prisma.user.create({
      data: {
        email,
        name: "Admin",
        role: "admin",
        passwordHash: await bcrypt.hash(password, 12),
      },
    });
    console.log(`admin created: ${email} (id=${user.id})`);
  }

  // Seed default welcome flow if missing.
  const defaultFlowId = "00000000-0000-0000-0000-000000000001";
  const flow = await prisma.flow.findUnique({ where: { id: defaultFlowId } });
  if (!flow) {
    await prisma.flow.create({
      data: {
        id: defaultFlowId,
        name: "Bienvenida (default)",
        description: "Saludo + menú con derivación a humano",
        triggerType: "default",
        priority: 100,
        isActive: true,
        definition: {
          start: "greet",
          nodes: {
            greet: {
              id: "greet",
              type: "message",
              text: "¡Hola {{profile_name}}! 👋 ¿En qué te ayudo?",
              next: "menu",
            },
            menu: {
              id: "menu",
              type: "buttons",
              text: "Selecciona una opción:",
              saveAs: "menu_choice",
              buttons: [
                { id: "info", title: "Información", goto: "info_msg" },
                { id: "asesor", title: "Hablar con asesor", goto: "human_handoff" },
              ],
            },
            info_msg: {
              id: "info_msg",
              type: "end",
              message: "Pronto te enviamos información detallada. ¡Gracias!",
            },
            human_handoff: {
              id: "human_handoff",
              type: "handoff",
              message: "Te conecto con un asesor. En breve te atiende alguien del equipo.",
            },
          },
        },
      },
    });
    console.log("default welcome flow seeded");
  } else {
    console.log("default welcome flow already exists");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
