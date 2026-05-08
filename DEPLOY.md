# Despliegue a producción

Arquitectura objetivo:

```
[ Web (Next.js) — Vercel ]  ──proxy /api/*──►  [ API + worker (Fastify+BullMQ) — Railway ]
                                                    │
                                ┌───────────────────┼───────────────────┐
                                ▼                                       ▼
                        [ Postgres — Supabase ]              [ Redis — Upstash o Railway ]
```

## 1. Postgres (Supabase) — ya lo tienes

Necesitas tener a la mano:
- `DATABASE_URL` (transaction pooler, port 6543, con `?pgbouncer=true&connection_limit=1`)
- `DIRECT_URL` (session pooler, port 5432) — para que `prisma migrate deploy` funcione

## 2. Redis — Upstash (recomendado, free)

1. Crea cuenta en https://upstash.com
2. **Create Database** → Region cerca de Railway (ej. us-east-1) → Type: Regional
3. Copia el connection string que empieza con `rediss://default:...` (TLS)
4. Lo usarás como `REDIS_URL`

## 3. API + worker — Railway

### 3.1. Crear el servicio

1. https://railway.app/dashboard → **New Project** → **Deploy from GitHub repo**
2. Selecciona `kreent/whastappEve`
3. Railway detecta `nixpacks.toml` y `railway.json` automáticamente
4. El primer build va a fallar — falta configurar variables. Eso es esperado.

### 3.2. Variables de entorno (Settings → Variables)

```
# --- WhatsApp Cloud API ---
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_BUSINESS_ACCOUNT_ID=...
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_WEBHOOK_VERIFY_TOKEN=...
WHATSAPP_APP_SECRET=...
WHATSAPP_API_VERSION=v21.0

# --- Database (Supabase) ---
DATABASE_URL=postgresql://postgres.xxx:PWD@aws-1-us-east-2.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
DIRECT_URL=postgresql://postgres.xxx:PWD@aws-1-us-east-2.pooler.supabase.com:5432/postgres

# --- Redis (Upstash) ---
REDIS_URL=rediss://default:xxx@us1-xxx.upstash.io:6379

# --- Auth ---
COOKIE_SECRET=  # genera 32+ chars random: `openssl rand -hex 32`
SESSION_COOKIE_NAME=wa_session
SESSION_TTL_HOURS=336

# --- App ---
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
WORKER_CONCURRENCY=1
```

> **Genera un cookie secret nuevo** para producción. No reuses el de dev.

### 3.3. Generar dominio público

Settings → **Networking** → **Generate Domain**. Te dará algo como
`https://whastappeve-production.up.railway.app`. Anótala — es la `API_BASE_URL`.

### 3.4. Redeploy

Settings → Deployments → **Deploy**. Mira los logs. Debería:
1. Instalar deps
2. Generar Prisma client
3. Compilar TypeScript a `dist/`
4. Aplicar migraciones (`prisma migrate deploy`)
5. Arrancar el server + worker

Verificación: `https://<railway-url>/health` debe responder `{"status":"ok"}`.

## 4. Frontend — Vercel

### 4.1. Crear el proyecto

1. https://vercel.com/new → Import del mismo repo `kreent/whastappEve`
2. **Root Directory**: `apps/web`
3. **Framework Preset**: Next.js (autodetectado)
4. **Build / Install** se autodetectan

### 4.2. Variables de entorno

```
API_BASE_URL=https://<tu-app>.up.railway.app
SESSION_COOKIE_NAME=wa_session
```

> `API_BASE_URL` es **server-side** — Next.js lo usa en `next.config.js` (rewrites)
> y en `lib/auth.ts` (server components). El browser nunca lo ve.

### 4.3. Deploy

Vercel deploya automáticamente. Al terminar te da una URL tipo
`https://whastapp-eve.vercel.app`. Esa es tu **dashboard pública**.

## 5. Apuntar Meta al webhook de Railway

En **Meta for Developers → App → WhatsApp → Configuration**:

- **Callback URL**: `https://<tu-app>.up.railway.app/webhook/whatsapp`
- **Verify Token**: el mismo `WHATSAPP_WEBHOOK_VERIFY_TOKEN` que pusiste en Railway
- **Verify and save** → Meta hace GET y debe responder OK
- Subscribe a `messages`

## 6. Crear el primer admin

Las migraciones crearon las tablas vacías. El seed ya no debe correr en producción.
Para crear el admin inicial, abre la consola de Railway (Settings → **Variables → ⋯ → Open Shell**)
y corre:

```bash
node -e "
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();
(async () => {
  await prisma.user.create({
    data: {
      email: 'TU_EMAIL@dominio.com',
      name: 'Tu Nombre',
      role: 'admin',
      passwordHash: await bcrypt.hash('TU_PASSWORD_FUERTE', 12),
    },
  });
  console.log('admin created');
})();
"
```

Igualmente crea el flow de bienvenida:

```bash
npm run prisma:seed -- --skip-admin   # o ajusta el seed para producción
```

## 7. Probar end-to-end

1. Entra a `https://<vercel-url>/login`
2. Loguéate con el admin recién creado
3. Manda un WhatsApp al número de Meta desde tu celular
4. Debería aparecer la conversación en tu inbox y el bot debería responder

## Troubleshooting

| Problema | Causa probable |
|---|---|
| Health responde pero `/api/auth/login` da 503 | Redis no conecta. Revisa `REDIS_URL` |
| Login OK pero `/api/auth/me` da 401 | `NODE_ENV` no está en `production` (cookie no es Secure y se descarta cross-origin) |
| Webhook de Meta da 401 invalid_signature | `WHATSAPP_APP_SECRET` no coincide con el de la app de Meta |
| Webhook de Meta da 403 verification_failed | `WHATSAPP_WEBHOOK_VERIFY_TOKEN` no coincide |
| Bot no responde | Mensaje recibido pero falla en Meta API. Revisa logs en Railway: probablemente `WHATSAPP_ACCESS_TOKEN` inválido |
| Migraciones fallan en deploy | Verifica que `DIRECT_URL` apunte al pooler de sesión (puerto 5432), no transaction (6543) |
