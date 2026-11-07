# 🏔️ Uttarakhand Boarding CRM — Enterprise Architecture (v3.0)

Production-grade Student CRM built with modern enterprise specifications:

---

## 🛠️ Technology Stack Breakdown

### Frontend (UI)
- **Framework**: [React.js 18](https://react.dev) + [Vite](https://vitejs.dev)
- **Language**: [TypeScript 5](https://www.typescriptlang.org)
- **Styling**: [TailwindCSS 3](https://tailwindcss.com) with Uttarakhand Boarding brand tokens
- **Component Primitives**: [shadcn/ui](https://ui.shadcn.com) design system
- **State Management**: [Zustand](https://github.com/pmndrs/zustand) (User profile, tokens, active role)
- **Data Fetching & Cache**: [TanStack Query v5](https://tanstack.com/query)
- **Forms & Validation**: [React Hook Form](https://react-hook-form.com) + [Zod](https://zod.dev)
- **Pipeline Kanban**: [@dnd-kit/core](https://dndkit.com) + `@dnd-kit/sortable`
- **Analytics Visuals**: [Recharts](https://recharts.org)

### Backend (API)
- **Framework**: [NestJS 10](https://nestjs.com) (Modular, enterprise dependency injection)
- **Language**: TypeScript with strict types
- **Database ORM**: [Prisma ORM 5](https://www.prisma.io)
- **Authentication**: JWT Access Token (15 min) + Refresh Token rotation (7 days) with token family reuse detection
- **Password Security**: `bcryptjs` with 12 rounds
- **DTO Validation**: `class-validator` + `class-transformer`
- **Background Jobs**: [BullMQ 5](https://bullmq.io) + Redis for async communications & alerts
- **Real-time WebSockets**: [Socket.io](https://socket.io) gateway
- **PDF Generation**: [Puppeteer](https://pptr.dev) for official Admission Confirmation Letters & Receipts

### Database & Storage
- **Primary Database**: PostgreSQL 16 (with relational constraints & Full-Text Search)
- **Cache & Message Broker**: Redis 7
- **Object Storage**: AWS S3 / Cloudflare R2 (for Admission documents & receipts)

---

## 📂 Project Directory Structure

```
Student CRM/
├── docker-compose.yml              # PostgreSQL 16 & Redis 7 containers
├── client/                         # React + Vite + TypeScript Frontend
│   ├── src/
│   │   ├── components/             # Navbar, Sidebar, UI primitives
│   │   ├── features/
│   │   │   ├── kanban/             # @dnd-kit Drag-and-drop lead stages
│   │   │   ├── analytics/          # Recharts dashboards (admissions & fees)
│   │   │   ├── commissions/        # 3-Way split immutable ledger table
│   │   │   ├── schools/            # Uttarakhand Boarding Schools directory
│   │   │   └── leads/              # Zod + React Hook Form enquiry modal
│   │   ├── lib/                    # Axios client with token refresh interceptor
│   │   ├── stores/                 # Zustand auth & session store
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   ├── tailwind.config.js
│   ├── vite.config.ts
│   └── package.json
│
└── server/                         # NestJS Backend API
    ├── prisma/
    │   ├── schema.prisma           # Relational schema (Users, Leads, Commissions, Admissions)
    │   └── seed.ts                 # Seeds admin, manager, counsellors & schools
    ├── src/
    │   ├── common/                 # RolesGuard, JwtAuthGuard, Decorators
    │   ├── modules/
    │   │   ├── auth/               # Bcrypt 12 rounds, JWT rotation, Sessions
    │   │   ├── leads/              # CRUD, Postgres FTS, Duplication check
    │   │   ├── admissions/         # Confirmation & Puppeteer PDF generation
    │   │   ├── commissions/        # 3-Way split calculation & approvals
    │   │   ├── schools/            # Uttarakhand schools repository
    │   │   ├── notifications/      # Socket.io WebSocket gateway
    │   │   └── queues/             # BullMQ Redis processors
    │   ├── app.module.ts
    │   └── main.ts
    ├── tsconfig.json
    └── package.json
```

---

## 🚀 Running the Project

### 1. Start the React Frontend:
```bash
npm run dev:client
```
Available at: **http://localhost:5432**

### 2. Start the NestJS Backend API:
```bash
npm run dev:server
```
API running at: **http://localhost:5432/api**

### 3. Optional: Run Local PostgreSQL & Redis via Docker:
```bash
docker compose up -d
```
*(Or point `DATABASE_URL` in `server/.env` to a free serverless PostgreSQL instance on [Neon.tech](https://neon.tech) or [Supabase](https://supabase.com)).*
