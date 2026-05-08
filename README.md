# Plataforma de Chatbot WhatsApp Business

Implementación de la plataforma descrita en [REQUIREMENTS.md](REQUIREMENTS.md).
Estado actual: **Fase 1 — MVP receptor/emisor**.

## Stack

- Node.js 20 + TypeScript + Fastify
- PostgreSQL + Prisma
- WhatsApp Cloud API (Meta) — Graph API v21.0

## Estructura

```
whatsapp/
├── apps/
│   └── api/                        # Backend Fastify
│       ├── prisma/schema.prisma    # Esquema de BD
│       └── src/
│           ├── config/env.ts       # Validación de env con Zod
│           ├── db/prisma.ts        # Cliente Prisma
│           ├── routes/webhook.ts   # GET/POST /webhook/whatsapp
│           ├── services/
│           │   ├── whatsapp.service.ts        # sendText, sendTemplate, markAsRead
│           │   ├── whatsapp.types.ts          # Tipos del payload de Meta
│           │   ├── webhook-signature.ts       # Validación X-Hub-Signature-256
│           │   ├── conversation.service.ts    # Persistencia de contactos/mensajes
│           │   └── inbound-handler.ts         # Echo bot + procesamiento
│           ├── server.ts           # Bootstrap Fastify (rawBody, content parser)
│           └── index.ts            # Entry point
├── package.json                    # Workspaces npm
├── .env.example
└── README.md
```

## Configuración inicial

1. Copia las variables de entorno y rellena los valores de tu app de Meta:
   ```bash
   cp .env.example .env
   ```
   Necesitas estos valores desde developers.facebook.com:
   - `WHATSAPP_PHONE_NUMBER_ID`
   - `WHATSAPP_ACCESS_TOKEN` (token permanente del System User)
   - `WHATSAPP_APP_SECRET` (App Settings → Basic)
   - `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (lo defines tú)

2. Instala dependencias:
   ```bash
   npm install
   ```

3. Levanta una base de datos PostgreSQL (local o gestionada) y ajusta `DATABASE_URL`.

4. Genera el cliente Prisma y aplica migraciones:
   ```bash
   npm run prisma:generate
   npm run prisma:migrate -- --name init
   ```

## Desarrollo

```bash
npm run dev:api
```

El servidor escucha en `http://localhost:3000`.

### Exponer el webhook a Meta

Meta requiere HTTPS público. En desarrollo, usa ngrok:

```bash
ngrok http 3000
```

Configura en Meta Developer Portal → WhatsApp → Configuration:
- **Callback URL:** `https://<tu-id>.ngrok-free.app/webhook/whatsapp`
- **Verify Token:** el mismo de `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- Suscríbete a los campos `messages`.

## Endpoints

| Método | Ruta                     | Auth                  | Propósito                        |
|--------|--------------------------|-----------------------|----------------------------------|
| GET    | `/health`                | —                     | Healthcheck                      |
| GET    | `/webhook/whatsapp`      | `verify_token` query  | Verificación inicial del webhook |
| POST   | `/webhook/whatsapp`      | `X-Hub-Signature-256` | Recepción de mensajes/eventos    |

## Comportamiento Fase 1

Al recibir un mensaje:

1. Se valida la firma `X-Hub-Signature-256` con el `WHATSAPP_APP_SECRET`.
2. Se responde `200 OK` inmediatamente (Meta reintenta si tarda > 5s).
3. Se hace upsert del contacto, se reutiliza/crea conversación abierta.
4. Se persiste el mensaje entrante (idempotente por `whatsapp_message_id`).
5. Se marca como leído.
6. Se envía un eco: `Recibí: {mensaje}` y se persiste el saliente.
7. Eventos `statuses` (sent/delivered/read/failed) actualizan el mensaje correspondiente.

## Comandos útiles

```bash
npm run dev:api               # Servidor en watch mode
npm run build:api             # Compilar a dist/
npm run start:api             # Ejecutar build
npm run prisma:generate       # Regenerar cliente Prisma
npm run prisma:migrate        # Crear/aplicar migración en dev
npm run typecheck --workspace=@app/api
```

## Próximas fases

Ver [REQUIREMENTS.md §9](REQUIREMENTS.md). La siguiente es:

- **Fase 2** — Cola asíncrona con Redis + BullMQ y reintentos.
