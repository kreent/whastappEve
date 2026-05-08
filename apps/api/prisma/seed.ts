import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/services/auth/password.js";
import type { FlowDefinition } from "../src/services/chatbot/flow.types.js";

const prisma = new PrismaClient();

async function seedAdmin(): Promise<void> {
  const email = "admin@local.test";
  const password = "admin123!"; // dev only — change after first login
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`seed: admin user already exists (${email})`);
    return;
  }
  await prisma.user.create({
    data: {
      email,
      name: "Admin",
      role: "admin",
      passwordHash: await hashPassword(password),
    },
  });
  console.log(`seed: admin user created — ${email} / ${password}`);
}

const welcomeFlow: FlowDefinition = {
  start: "greet",
  nodes: {
    greet: {
      id: "greet",
      type: "message",
      text:
        "¡Hola {{profile_name}}! 👋 Soy el asistente virtual. Estoy aquí para ayudarte.",
      next: "menu",
    },
    menu: {
      id: "menu",
      type: "buttons",
      text: "¿En qué te puedo ayudar hoy?",
      footer: "Selecciona una opción",
      saveAs: "menu_choice",
      buttons: [
        { id: "info", title: "Información", goto: "info_msg" },
        { id: "horario", title: "Horario", goto: "horario_msg" },
        { id: "asesor", title: "Hablar con asesor", goto: "human_handoff" },
      ],
    },
    info_msg: {
      id: "info_msg",
      type: "message",
      text:
        "Somos una empresa que se dedica a brindar el mejor servicio. " +
        "Visítanos en nuestra web o pregúntame lo que necesites.",
      next: "ask_more",
    },
    horario_msg: {
      id: "horario_msg",
      type: "message",
      text: "Atendemos de lunes a viernes de 9:00 a 18:00 (hora Colombia).",
      next: "ask_more",
    },
    ask_more: {
      id: "ask_more",
      type: "buttons",
      text: "¿Necesitas algo más?",
      saveAs: "more",
      buttons: [
        { id: "yes", title: "Sí, otra consulta", goto: "menu" },
        { id: "no", title: "No, gracias", goto: "farewell" },
        { id: "asesor", title: "Hablar con asesor", goto: "human_handoff" },
      ],
    },
    farewell: {
      id: "farewell",
      type: "end",
      message: "¡Listo! Cualquier cosa, escríbeme cuando quieras. 👋",
    },
    human_handoff: {
      id: "human_handoff",
      type: "handoff",
      message: "Perfecto, te conecto con un asesor. En breve te atenderá alguien del equipo.",
    },
  },
};

async function main(): Promise<void> {
  await prisma.flow.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {
      name: "Bienvenida (default)",
      description: "Saludo + menú principal con derivación a humano",
      triggerType: "default",
      isActive: true,
      definition: welcomeFlow as unknown as object,
      priority: 100,
    },
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Bienvenida (default)",
      description: "Saludo + menú principal con derivación a humano",
      triggerType: "default",
      isActive: true,
      definition: welcomeFlow as unknown as object,
      priority: 100,
    },
  });
  console.log("seed: default welcome flow ready");
  await seedAdmin();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
