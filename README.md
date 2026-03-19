# Aquaria — Setup Guide

## Estructura de archivos

```
src/
├── app/
│   ├── auth/
│   │   ├── actions.ts          ← Server Actions: login, register, logout
│   │   ├── layout.tsx
│   │   ├── login/page.tsx      ← Pantalla login
│   │   └── register/page.tsx   ← Pantalla registro
│   ├── dashboard/
│   │   ├── actions.ts          ← Server Actions: CRUD bitácoras
│   │   ├── DashboardClient.tsx ← UI del dashboard (client component)
│   │   └── page.tsx            ← Server page (lee sesión + perfil)
│   ├── bitacora/
│   │   ├── BitacoraClient.tsx  ← UI de la bitácora (client component)
│   │   └── page.tsx            ← Server page
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                ← Redirect raíz
├── components/
│   └── ui/
│       └── RutInput.tsx        ← Input RUT con validación en tiempo real
├── lib/
│   ├── rut.ts                  ← Validador/formateador RUT chileno
│   └── supabase/
│       ├── client.ts           ← Browser client
│       └── server.ts           ← Server client (cookies)
├── middleware.ts                ← Protección de rutas
└── types/index.ts              ← Tipos TypeScript + constantes
```

## Pasos para correr el proyecto

### 1. Variables de entorno

Crea `.env.local` en la raíz:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Ejecutar la base de datos

En Supabase → SQL Editor, ejecuta el schema SQL entregado anteriormente
(tablas: profiles, modules, logs, log_parameters, checklist_responses, fisicoquimicos).

### 4. Configurar Auth en Supabase

- Authentication → URL Configuration
  - Site URL: `http://localhost:3000`
  - Redirect URLs: `http://localhost:3000/**`

### 5. Correr en desarrollo

```bash
npm run dev
```

### 6. Deploy en Vercel

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel --prod
```

## Flujo de navegación

```
/ → (redirect según sesión)
  ├── /auth/login      ← sin sesión
  ├── /auth/register
  └── /dashboard       ← con sesión
        └── /bitacora?module=hat&date=2025-03-19&shift=dia&mode=create
```

## Notas importantes

- El middleware en `src/middleware.ts` protege todas las rutas automáticamente
- `searchParams` y `cookies()` son async en Next 16 — ya está manejado
- Los Server Actions usan `redirect()` para pasar errores vía URL params
- El componente `RutInput` valida el dígito verificador en tiempo real (client-side)
- La tabla `profiles` se llena automáticamente via trigger de Supabase al registrarse