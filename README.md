# EveGate — Plataforma de Atención Multicanal y Cobranza

Sistema completo para atender clientes por **WhatsApp Business** y **Telegram**, con
chatbot configurable, gestión de créditos y cobranza automatizada con **ComboPay**.

URL pública del producto: ver tu deploy en Vercel · API: Railway · DB: Supabase · Redis: Railway

---

## Tabla de contenido

- [Resumen del producto](#resumen-del-producto)
- [Estado actual — fases construidas](#estado-actual--fases-construidas)
- [Stack técnico](#stack-técnico)
- [Arquitectura](#arquitectura)
- [Estructura del repositorio](#estructura-del-repositorio)
- [Variables de entorno](#variables-de-entorno)
- [Desarrollo local](#desarrollo-local)
- [Despliegue a producción](#despliegue-a-producción)
- [Configuración necesaria para que funcione real](#configuración-necesaria-para-que-funcione-real)
- [Endpoints principales](#endpoints-principales)
- [Comandos útiles](#comandos-útiles)
- [Pendientes / próximas fases](#pendientes--próximas-fases)
- [Limitaciones conocidas](#limitaciones-conocidas)

---

## Resumen del producto

EveGate reemplaza herramientas tipo WATI / Respond.io. Un cliente escribe a tu número
de WhatsApp (o tu bot de Telegram), un chatbot configurable lo atiende, y si la
conversación necesita un humano la deriva a un agente que la toma desde el dashboard
web tipo Intercom.

Además gestiona **créditos**: asignas a cada cliente una deuda con N cuotas. El día
del vencimiento, el sistema le envía un mensaje plantilla con un link de pago único
generado por ComboPay. Cuando el cliente paga, ComboPay nos avisa por webhook y la
cuota se marca como pagada automáticamente.

**Volumen objetivo:** 50–500 mensajes/día (1.500–15.000/mes), apto para una pyme o
equipo pequeño de cobranza/soporte.

## Estado actual — fases construidas

| Fase | Descripción | Estado |
|---|---|---|
| 1 | MVP webhook + WhatsApp Cloud API | ✅ |
| 2 | Cola Redis + BullMQ con retries y per-phone lock | ✅ |
| 3 | Motor de chatbot (state-machine, 8 tipos de nodo, keywords, horario) | ✅ |
| 4 | Auth (cookies HttpOnly + bcrypt) + APIs REST del dashboard | ✅ |
| 5 | UI Next.js (login + bandeja Intercom + chat + panel cliente) | ✅ |
| 6 | Editor visual de flujos drag-and-drop (React Flow) | ✅ |
| 7 | Plantillas (sync con Meta) + métricas con gráficos | ✅ |
| 8 | IA con Claude API | ⏸ pendiente |
| 9 | Deploy a producción (Railway + Vercel + Supabase + Upstash) | ✅ |
| 10 | Broadcasts (campañas masivas) + import CSV + opt-out automático | ✅ |
| 11 | Créditos + cuotas + recordatorios diarios automáticos | ✅ |
| 12 | Multicanal (Telegram) + módulo de Configuración desde la UI | ✅ |
| 13 | Integración con ComboPay para links de pago + confirmación auto | ✅ |

## Stack técnico

| Capa | Tecnología |
|---|---|
| Backend | Node.js 20 + TypeScript + Fastify |
| Base de datos | PostgreSQL (Supabase) + Prisma |
| Cache / Cola | Redis (Railway) + BullMQ |
| Frontend | Next.js 14 + React 18 + TailwindCSS |
| Editor de flujos | @xyflow/react (React Flow v12) |
| Gráficos | Recharts |
| Auth | Cookies HttpOnly + bcryptjs (sin OAuth/JWT) |
| Mensajería | WhatsApp Cloud API · Telegram Bot API |
| Pagos | ComboPay |
| Hosting API | Railway (Nixpacks) |
| Hosting Web | Vercel |

## Arquitectura

```
                         ┌─────────────────────────────────┐
                         │  Web (Next.js) — Vercel          │
                         │  /login /inbox /clientes         │
                         │  /flows /broadcasts /debts       │
                         │  /templates /metrics /settings   │
                         └────────────────┬────────────────┘
                                          │ /api/* (rewrites)
                                          ▼
┌──────────────────────┐         ┌─────────────────────────────┐         ┌────────────────┐
│  Cliente WhatsApp /  │ ───►    │  API + Workers — Railway    │ ◄──     │  ComboPay      │
│  Cliente Telegram    │ webhook │  (Fastify + BullMQ)         │ webhook │  (notif pago)  │
└──────────────────────┘         │                             │         └────────────────┘
                                 │  /webhook/whatsapp          │
                                 │  /webhook/telegram          │
                                 │  /webhook/combopay          │
                                 └────┬─────────────┬──────────┘
                                      │             │
                                      ▼             ▼
                              ┌──────────┐   ┌──────────┐
                              │ Postgres │   │  Redis   │
                              │ Supabase │   │ Railway  │
                              └──────────┘   └──────────┘
                              contactos, conversaciones,
                              mensajes, flujos, plantillas,
                              campañas, créditos, cuotas,
                              usuarios, settings, audit logs
```

## Estructura del repositorio

```
whatsapp/                      ← npm workspaces monorepo
├── apps/
│   ├── api/                   ← Backend Fastify
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   ├── scripts/
│   │   │   └── bootstrap-admin.ts   ← crea primer admin en producción
│   │   └── src/
│   │       ├── config/env.ts        ← validación con Zod
│   │       ├── middleware/auth.ts   ← requireAuth / requireAdmin
│   │       ├── queues/              ← BullMQ
│   │       │   ├── inbound.queue.ts + worker
│   │       │   ├── broadcast.queue.ts + worker
│   │       │   ├── reminder.queue.ts + worker (cron diario 9 AM Bogotá)
│   │       │   └── lock.ts          ← lock per-phone para evitar race
│   │       ├── routes/
│   │       │   ├── auth.ts          ← login / logout / me
│   │       │   ├── conversations.ts ← inbox + send + assign + notes
│   │       │   ├── contacts.ts      ← CRUD + CSV import
│   │       │   ├── flows.ts         ← CRUD flujos del bot
│   │       │   ├── templates.ts     ← plantillas + sync Meta
│   │       │   ├── campaigns.ts     ← broadcasts
│   │       │   ├── debts.ts         ← créditos y cuotas
│   │       │   ├── metrics.ts       ← KPIs del dashboard
│   │       │   ├── settings.ts      ← config WhatsApp/Telegram/ComboPay/horario
│   │       │   ├── webhook.ts            ← entrada WhatsApp
│   │       │   ├── webhook-telegram.ts   ← entrada Telegram
│   │       │   └── webhook-combopay.ts   ← notificaciones de pago
│   │       └── services/
│   │           ├── config.service.ts   ← settings desde DB con cache 30s
│   │           ├── whatsapp.service.ts ← Graph API
│   │           ├── telegram.service.ts ← Bot API
│   │           ├── combopay.service.ts ← invoice + status
│   │           ├── channels.ts         ← dispatcher WA/Telegram
│   │           ├── chatbot/            ← motor de flujos
│   │           │   ├── engine.ts
│   │           │   ├── flow.repository.ts
│   │           │   ├── business-hours.ts
│   │           │   ├── handoff-keywords.ts
│   │           │   └── interpolate.ts
│   │           ├── debts.service.ts
│   │           ├── reminder-resolver.ts
│   │           ├── campaigns.service.ts
│   │           ├── optout.ts
│   │           ├── auth/{password,session,audit}.ts
│   │           └── csv.ts
│   └── web/                   ← Frontend Next.js
│       ├── public/            ← logo.png, login.png
│       └── src/
│           ├── app/           ← App Router
│           │   ├── login/
│           │   ├── inbox/
│           │   ├── clientes/  (alias de /contacts)
│           │   ├── flows/
│           │   ├── templates/
│           │   ├── broadcasts/
│           │   ├── debts/
│           │   ├── metrics/
│           │   └── settings/
│           ├── components/
│           │   ├── Sidebar, ChatView, MessageBubble, ContactPanel
│           │   ├── ContactsList, ContactDetail
│           │   ├── ImportContactsModal
│           │   ├── FlowsList + flow-editor/* (Editor, Palette, Inspector,
│           │   │   CustomNode, convert.ts)
│           │   ├── TemplatesList + SendTemplateModal
│           │   ├── CampaignsList + NewCampaignModal + CampaignDetail
│           │   ├── DebtsDashboard + NewDebtModal
│           │   ├── MetricsDashboard
│           │   └── SettingsTabs (WhatsApp, Telegram, ComboPay, Horario)
│           ├── lib/api.ts     ← fetch helper con credentials: include
│           ├── lib/auth.ts    ← server-side cookie check
│           └── middleware.ts  ← redirige a /login si no hay cookie
├── nixpacks.toml              ← config build Railway
├── railway.json
├── DEPLOY.md                  ← guía paso-a-paso de despliegue
├── REQUIREMENTS.md            ← documento de requerimientos original
└── README.md                  ← este archivo
```

## Variables de entorno

Ver `.env.example`. Resumen de las críticas en producción:

### Backend (Railway → Variables)
```
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
WORKER_CONCURRENCY=1

# Postgres (Supabase pooler)
DATABASE_URL=postgresql://...:6543/postgres?pgbouncer=true&connection_limit=1
DIRECT_URL=postgresql://...:5432/postgres

# Redis (referencia al servicio Redis de Railway)
REDIS_URL=${{Redis.REDIS_URL}}

# Auth
COOKIE_SECRET=                  # 32+ chars random
SESSION_COOKIE_NAME=wa_session
SESSION_TTL_HOURS=336

# WhatsApp — defaults; pueden sobrescribirse desde /settings UI
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
WHATSAPP_API_VERSION=v21.0

# Cron de recordatorios
REMINDER_HOUR=9
REMINDER_TZ=America/Bogota

# ComboPay (opcional — la URL pública para que el worker arme links de webhook)
PUBLIC_API_URL=https://appapi-production-xxxx.up.railway.app
```

### Frontend (Vercel → Environment Variables)
```
API_BASE_URL=https://appapi-production-xxxx.up.railway.app
SESSION_COOKIE_NAME=wa_session
```

> **Nota importante**: Las credenciales de WhatsApp, Telegram y ComboPay **se
> configuran desde la UI** en `/settings` (admin-only). Los valores en `env`
> son fallback iniciales. Cambios desde la UI se aplican en menos de 30 segundos
> sin reinicio.

## Desarrollo local

### Prerequisitos
- Node.js 20+
- PostgreSQL (local o Supabase)
- Redis (`brew install redis && brew services start redis` en macOS)

### Setup
```bash
# 1. Clonar e instalar
git clone https://github.com/kreent/whastappEve.git
cd whastappEve
npm install

# 2. Configurar .env
cp .env.example apps/api/.env
# editar con tus valores

# 3. Migraciones + seed
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run prisma:seed --workspace=@app/api

# 4. Levantar API y Web (en terminales separadas)
npm run dev:api    # http://localhost:3000
npm run dev:web    # http://localhost:3001
```

Login demo: `admin@local.test` / `admin123!` (cámbialo en producción).

## Despliegue a producción

Ver [DEPLOY.md](DEPLOY.md) para la guía completa paso a paso.

### Resumen
1. **Postgres**: Supabase (ya hay cuenta) — usa los pooler URLs (transaction 6543 para runtime, session 5432 para migraciones).
2. **Redis**: Railway add-on en el mismo proyecto (`+ Add → Database → Redis`), referenciar como `${{Redis.REDIS_URL}}`.
3. **API**: Railway conecta el repo `kreent/whastappEve` desde GitHub. Root Directory `/`. `nixpacks.toml` ya configura el build.
4. **Web**: Vercel con Root Directory `apps/web`. Define `API_BASE_URL` con la URL pública de Railway.
5. **Bootstrap admin**: corre desde local apuntando al Supabase de producción:
   ```bash
   cd apps/api
   BOOTSTRAP_ADMIN_EMAIL='tu@email.com' \
   BOOTSTRAP_ADMIN_PASSWORD='Pwd-Fuerte' \
   npm run bootstrap:admin
   ```
6. Cualquier `git push` a `main` → Railway y Vercel redeployan automáticamente.

## Configuración necesaria para que funcione real

Para que la app **envíe y reciba mensajes reales**, necesitas:

### 1. WhatsApp Business
- Cuenta de **Meta Business** verificada (puede tomar 1-2 semanas la primera vez).
- App tipo "Business" en `developers.facebook.com` con producto **WhatsApp** agregado.
- **System User** con token permanente y permisos `whatsapp_business_messaging` + `whatsapp_business_management`.
- Número de teléfono dedicado registrado en la API.
- En la app `/settings → WhatsApp`: pegar `Phone Number ID`, `Business Account ID`, `Access Token`, `App Secret`, `Webhook Verify Token`.
- En Meta Developer Portal → WhatsApp → Configuration:
  - Callback URL: `https://<tu-railway>.up.railway.app/webhook/whatsapp`
  - Verify Token: el mismo que pusiste en `/settings`.
  - Subscribe a campos `messages`.

### 2. Telegram (opcional, complementa o reemplaza WhatsApp)
- Crear bot con `@BotFather` en Telegram → recibes un token.
- En la app `/settings → Telegram`: pegar el token, username del bot, y un secret aleatorio (recomendado).
- Click "Configurar webhook en Telegram" con la URL `https://<tu-railway>.up.railway.app/webhook/telegram`.
- Para vincular un cliente al bot: comparte `https://t.me/<tu_bot>?start=<contact_id>`. Cuando el cliente le da "Start" queda vinculado.

### 3. ComboPay (opcional, para cobranza automatizada)
- Cuenta en ComboPay y token Bearer.
- En la app `/settings → ComboPay`: pegar API token + base URL + secret de webhook.
- En el panel de ComboPay configurar la URL `https://<tu-railway>.up.railway.app/webhook/combopay?secret=<tu-secret>` como notificador.
- Crear plantilla `recordatorio_cuota_credito` (ya seedeada como draft) y aprobarla en Meta.
- Asignar créditos a clientes desde `/clientes/<id>` con la plantilla aprobada.

### 4. Crear primer admin (en producción)
Como el seed solo corre en dev, en producción usa el script `bootstrap-admin` (ver sección Despliegue).

## Endpoints principales

### Webhooks (públicos)
| Método | Ruta | Validación |
|---|---|---|
| GET/POST | `/webhook/whatsapp` | `X-Hub-Signature-256` (HMAC) |
| POST | `/webhook/telegram` | `X-Telegram-Bot-Api-Secret-Token` (header) |
| POST | `/webhook/combopay` | `?secret=` query (opcional) |

### API (cookie HttpOnly)
| Categoría | Endpoints |
|---|---|
| Auth | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` |
| Conversaciones | `GET /api/conversations`, `GET /:id`, `POST /:id/messages`, `PATCH /:id`, `POST /:id/notes` |
| Contactos | `GET /api/contacts`, `GET /:id`, `PATCH /:id`, `POST /import` |
| Flujos | `GET /api/flows`, `GET /:id`, `POST`, `PUT /:id` (admin) |
| Plantillas | `GET /api/templates`, `POST`, `DELETE`, `POST /:id/submit`, `POST /sync` |
| Campañas | `GET /api/campaigns`, `GET /:id`, `POST /preview`, `POST`, `POST /:id/send`, `POST /:id/cancel` |
| Créditos | `GET /api/debts`, `POST`, `DELETE`, `GET /api/installments`, `PATCH /:id`, `POST /:id/send-now`, `POST /api/debts/run-reminders` |
| Métricas | `GET /api/metrics/dashboard?days=N` |
| Configuración | `GET/PUT /api/settings/{whatsapp,telegram,combopay,business-hours}` (admin) |

## Comandos útiles

```bash
# Desarrollo
npm run dev:api               # Backend en watch mode (puerto 3000)
npm run dev:web               # Frontend en watch mode (puerto 3001)

# Build
npm run build:api
npm run build:web

# Prisma
npm run prisma:generate                   # Regenerar cliente
npm run prisma:migrate                    # Crear/aplicar migración (dev)
npm run prisma:seed --workspace=@app/api  # Seed inicial (admin + flow demo)
npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma  # Producción

# Typecheck
npm run typecheck --workspace=@app/api
npm run typecheck --workspace=@app/web

# Bootstrap admin en producción (apuntando al Supabase de prod)
cd apps/api
BOOTSTRAP_ADMIN_EMAIL='admin@empresa.com' \
BOOTSTRAP_ADMIN_PASSWORD='SecurePwd' \
npm run bootstrap:admin
```

## Pendientes / próximas fases

### Pendientes funcionales
- **Fase 8 — IA con Claude**: cuando ningún flujo del bot matchea, llamar a Claude con
  contexto de conversación y base de conocimiento (markdown / pgvector). Si la
  confianza es baja, derivar a humano.
- **Editor de plantillas con botones**: hoy el editor solo soporta body+footer. Falta
  agregar soporte para botones de URL/PHONE/QUICK_REPLY de plantillas Meta.
- **Variables custom por destinatario en campañas**: hoy el mapeo es por campo del
  contacto o valor estático único. Permitir CSV con columnas que se mapeen a
  parámetros distintos por fila.
- **Endpoint de gestión de usuarios** (`POST /api/users`, `PATCH`, etc.) para que un
  admin pueda crear más agentes desde la UI sin tocar la BD.
- **Cambio de password desde la UI** — hoy se hace por script.
- **Sistema de etiquetas globales** centralizado (hoy son strings libres por contacto).
- **Botón "Probar flujo en sandbox"** dentro del editor de flujos para simular sin
  enviar a un cliente real.
- **Búsqueda full-text** sobre mensajes y notas.
- **Notificaciones push/email** al agente cuando una conversación pendiente lleva
  mucho tiempo sin atención.

### Pendientes de configuración (lado tuyo)
- Verificar el negocio en Meta Business y registrar el número definitivo de WhatsApp.
- Aprobar plantilla `recordatorio_cuota_credito` en Meta (botón "Enviar a Meta" en
  `/templates`).
- Generar token API de ComboPay y configurar webhook de ComboPay apuntando al
  endpoint de Railway.
- Crear bot de Telegram con `@BotFather` y configurar el webhook desde `/settings`.
- Rotar la contraseña de Supabase y el `COOKIE_SECRET` después de la fase de pruebas.

### Mejoras técnicas pendientes
- **Concurrency > 1 en workers**: hoy `WORKER_CONCURRENCY=1` para garantizar FIFO por
  cliente. Para escalar arriba de 500 msg/día sería bueno usar groupKey de BullMQ
  Pro o particionar por phone hash.
- **Backups manuales además de los de Supabase**: Supabase ya tiene backup diario en
  plan gratis, pero un dump semanal a S3/R2 sería robustez extra.
- **Métricas precalculadas**: hoy el endpoint `/api/metrics/dashboard` agrega en cada
  request. A volumen alto convendría un cron que precalcule diariamente.
- **Tests de integración**: hoy todo se prueba manualmente con curl. Agregar
  Playwright/Vitest para suites de regresión.
- **Observabilidad**: logs hoy van a stdout (Pino → Railway). Agregar Logtail o
  Datadog si necesitas alertas y búsqueda histórica.
- **Rate limiting en endpoints públicos** (`/webhook/*` ya está protegido por firma
  pero `/api/auth/login` no tiene throttle anti-brute-force).

## Limitaciones conocidas

- **Telegram no tiene plantillas**: cuando se envía una plantilla por Telegram, se
  renderiza a texto plano (sustituyendo `{{1}}, {{2}}` con sus valores). Sin la
  validación previa de Meta. Esto es lo correcto pero el cliente lo verá distinto al
  de WhatsApp.
- **Botones interactivos por Telegram**: se renderizan como texto numerado
  ("1) Opción 1\n2) Opción 2"). El cliente responde con el número.
- **ComboPay test mode**: hoy si el token es inválido, la generación de invoice falla
  silenciosamente y el recordatorio se envía sin link. Falta un modo demo/sandbox
  explícito.
- **Recordatorios con timezone único**: todos los créditos usan `REMINDER_TZ` global.
  Para clientes en distintos países habría que hacerlo por cliente.
- **Idempotencia ComboPay**: si ComboPay re-envía la misma notificación, se procesa
  igual sin daño porque la transición a `paid` solo cambia el estado una vez. Pero
  no hay deduplicación por `unique_transaction_code` aún.
- **Multi-tenancy**: 1 instancia = 1 negocio. Para SaaS con varios clientes habría
  que extender el schema con `organization_id` en todos los modelos.

---

## Créditos

Implementado por Carolina Herrera, asistido por Claude (Anthropic).
Repositorio: [github.com/kreent/whastappEve](https://github.com/kreent/whastappEve).
