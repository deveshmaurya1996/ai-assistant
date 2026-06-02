# 🦈 Bull Shark Projects — Full Implementation Context

> **Generated:** 2026-05-28  
> **Projects Covered:** Davinci Booking, Epona App, Lamima Software, Lands Authority, Mediation Centre Portal, Thriveon Digital Platform  
> **Author:** Antigravity AI — Full deep-dive analysis across all 6 active workspaces

---

## Table of Contents

1. [Davinci Booking System](#1-davinci-booking-system)
2. [Epona App](#2-epona-app)
3. [Lamima Workflow Management](#3-lamima-workflow-management)
4. [Lands Authority Platform](#4-lands-authority-platform)
5. [Mediation Centre Portal](#5-mediation-centre-portal)
6. [Thriveon Digital Platform](#6-thriveon-digital-platform)
7. [Cross-Project Patterns & Shared Observations](#7-cross-project-patterns--shared-observations)

---

---

# 1. Davinci Booking System

## Overview

**Repository:** `davinci-booking/`  
**Type:** Healthcare / Doctor Booking Web Plugin (SPA)  
**Primary Tech:** React 19 + Vite + TypeScript + TailwindCSS 4  
**Orchestration:** .NET Aspire  

The Davinci Booking System is a **healthcare appointment booking plugin** — a standalone web application (likely embedded as an iframe or web component into a client-facing site) that allows patients to book appointments with doctors by selecting a speciality, choosing a doctor, checking availability, entering personal details, and completing payment.

---

## Repository Structure

```
davinci-booking/
├── aspire/
│   └── davinci.booking-system.Aspire.AppHost/    ← .NET Aspire orchestrator
│       └── Program.cs                            ← Launches web-client via pnpm
├── davinci-booking-system/                        ← Frontend monorepo (pnpm workspace)
│   ├── apps/
│   │   └── davinci-plugin/                       ← Main Vite React SPA
│   │       ├── src/
│   │       │   ├── App.tsx                        ← Root component + routing
│   │       │   ├── main.tsx                       ← Entry point
│   │       │   ├── index.css                      ← Global styles (TailwindCSS)
│   │       │   ├── pages/                         ← Route-level page components
│   │       │   │   ├── SpecialitiesPage.tsx        ← Step 1: Choose speciality
│   │       │   │   ├── DoctorsPage.tsx             ← Step 2: Choose doctor
│   │       │   │   ├── AvailabilityPage.tsx        ← Step 3: Pick time slot
│   │       │   │   ├── UserDetailsPage.tsx         ← Step 4: Patient details form
│   │       │   │   ├── PaymentPage.tsx             ← Step 5: Payment
│   │       │   │   ├── BookingConfirmationPage.tsx ← Step 6: Confirmation
│   │       │   │   └── index.ts
│   │       │   ├── components/                    ← Reusable UI components
│   │       │   ├── contexts/                      ← React context providers
│   │       │   ├── hooks/                         ← Custom React hooks
│   │       │   ├── services/                      ← API call layer
│   │       │   ├── lib/                           ← Utilities / config
│   │       │   ├── types/                         ← TypeScript interfaces
│   │       │   ├── constants/                     ← Shared constants
│   │       │   ├── assets/                        ← Images, icons
│   │       │   └── utils/                         ← Helper functions
│   │       ├── package.json
│   │       ├── vite.config.ts
│   │       ├── tsconfig.app.json
│   │       ├── nginx.conf                         ← Production NGINX config
│   │       └── Dockerfile                         ← Containerized for deployment
│   ├── package.json                               ← Monorepo root
│   └── pnpm-workspace.yaml
├── davinci.booking-system.sln                     ← .NET solution file
└── GitVersion.yml
```

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | React | 19.2.0 |
| Build Tool | Vite | 7.x |
| Language | TypeScript | ~5.9.3 |
| Styling | TailwindCSS | 4.x (via @tailwindcss/vite) |
| Routing | React Router DOM | 7.x |
| Data Fetching | TanStack React Query | 5.x |
| HTTP Client | Axios | 1.x |
| Date Handling | date-fns | 4.x |
| Icons | Lucide React + Iconify | latest |
| Phone Input | react-international-phone | 4.x |
| Date Picker | react-day-picker | 9.x |
| Cookie Management | js-cookie | 3.x |
| Testing | Vitest + @testing-library/react | 4.x |
| Orchestration | .NET Aspire | latest |
| Containerization | Docker + NGINX | — |
| Package Manager | pnpm (workspace) | — |

---

## Architecture & Workflow

### Booking Flow (Multi-Step Wizard)
```
Step 1: SpecialitiesPage  →  Choose medical speciality
Step 2: DoctorsPage       →  Browse & select a doctor
Step 3: AvailabilityPage  →  Pick available date/time slot
Step 4: UserDetailsPage   →  Enter patient details
Step 5: PaymentPage       →  Complete payment
Step 6: BookingConfirmationPage  →  Booking confirmed
```

### Data Flow Pattern
- **TanStack Query** handles server state (fetching doctors, availabilities)
- **React Context** manages wizard step state and booking session data
- **Axios** is the HTTP client for API communication
- **React Router DOM v7** handles navigation between wizard steps

### Aspire Orchestration
The `Program.cs` in the AppHost simply launches the frontend pnpm dev server:
```csharp
var webClient = builder
    .AddPnpmApp("web-client", "../../davinci-booking-system", "dev:plugin")
    .WithHttpEndpoint(targetPort: 5173);
```
This means the project is **frontend-only** at this stage — the backend API it connects to is external.

### Containerization
- NGINX serves the production build
- Dockerfile present for container deployment
- Custom `nginx.conf` for SPA routing (fallback to `index.html`)

---

## Key Directories Explained

| Directory | Purpose |
|---|---|
| `src/pages/` | Each booking wizard step is a separate page component |
| `src/contexts/` | Booking state shared across wizard steps |
| `src/hooks/` | Custom hooks for data fetching and form handling |
| `src/services/` | API service functions (specialities, doctors, availability, payment) |
| `src/lib/` | Config, utilities, API base setup |
| `src/types/` | TypeScript interfaces for API responses |

---

## What Can Be Improved

| Area | Current State | Improvement |
|---|---|---|
| **Backend** | External / unknown | Add a Node.js or .NET backend service to the Aspire host for full-stack orchestration |
| **State Management** | React Context | Consider Zustand or Jotai for more scalable state as wizard grows |
| **Error Handling** | Unclear from structure | Add global error boundaries and TanStack Query error states |
| **Accessibility** | Unknown | Add ARIA labels and keyboard navigation for the booking wizard |
| **i18n** | Not present | Add `next-intl` or `react-i18next` for multilingual support |
| **Analytics** | Not present | Integrate PostHog or Plausible for booking funnel analytics |
| **Testing Coverage** | Vitest configured | Increase unit and integration test coverage |
| **Real-time Availability** | Polling assumed | Consider WebSockets or SSE for live slot updates |

---

---

# 2. Epona App

## Overview

**Repository:** `epona-app/`  
**Type:** Social/Gamification Mobile App (Horse Riding)  
**Primary Tech:** Expo (React Native) + Strapi CMS + Node.js Gateway API  
**Orchestration:** .NET Aspire  

Epona is a **social mobile application** for horse riders. Users can:
- Track equestrian challenges
- Earn badges upon challenge completion
- View and compare on a leaderboard
- Manage horse profiles
- Handle subscriptions and in-app purchases
- Authenticate via Google, Facebook, and Apple

---

## Repository Structure

```
epona-app/
├── aspire/
│   └── Epona.Aspire.Host/              ← .NET Aspire orchestrator
├── dotnet/
│   └── Epona.Aspire.Host/              ← Aspire host project (runs Docker containers)
├── epona-admin/                         ← Strapi CMS (Backoffice & Content Admin)
│   ├── src/
│   │   ├── api/                         ← Strapi API collections
│   │   │   ├── badge/                   ← Badges content type
│   │   │   ├── badge-earner/            ← Badge earning records
│   │   │   ├── challenge/               ← Challenges content type
│   │   │   ├── challenge-eligibility/   ← Who can join challenges
│   │   │   ├── challenge-participant/   ← Participation tracking
│   │   │   ├── coupon/                  ← Discount coupons
│   │   │   ├── difficulty-level/        ← Difficulty tiers
│   │   │   ├── discipline/              ← Riding disciplines
│   │   │   ├── payment/                 ← Payment records
│   │   │   ├── ride-activity/           ← Ride logging
│   │   │   ├── ride-activity-photo/     ← Photos per ride
│   │   │   ├── riding-experience-level/ ← User skill level
│   │   │   ├── subscription/            ← User subscriptions
│   │   │   ├── subscription-type/       ← Subscription tiers
│   │   │   ├── user-discipline/         ← Disciplines per user
│   │   │   ├── user-horse/              ← Horse profiles per user
│   │   │   └── user-table/              ← Extended user data
│   │   ├── admin/                       ← Strapi admin customizations
│   │   ├── extensions/                  ← Strapi plugin extensions
│   │   ├── index.ts                     ← Strapi bootstrap/register
│   │   └── seed.ts                      ← Data seeding (36KB — extensive)
│   ├── config/                          ← Strapi server/database/plugin config
│   ├── database/                        ← DB migrations
│   ├── types/                           ← Generated TypeScript types
│   └── package.json                     ← Strapi 5.x
│
├── epona-app/                           ← Expo Mobile App monorepo (pnpm workspace)
│   ├── apps/
│   │   └── epona-app/                   ← Main Expo React Native app
│   │       ├── app/                     ← Expo Router file-based routing
│   │       │   ├── _layout.tsx          ← Root navigation layout
│   │       │   ├── (auth)/              ← Auth screens (login, register)
│   │       │   ├── (onboarding)/        ← First-run onboarding flow
│   │       │   ├── (tabs)/              ← Main tab navigation
│   │       │   ├── challenges/          ← Challenge detail screens
│   │       │   └── payment/             ← Payment flow
│   │       ├── services/                ← API service layer (12 services)
│   │       │   ├── authService.ts       ← Auth (Google, Facebook, Apple)
│   │       │   ├── challengeService.ts  ← Challenge CRUD + join/leave
│   │       │   ├── badgeService.ts      ← Badge fetching
│   │       │   ├── leaderboardService.ts← Leaderboard queries
│   │       │   ├── horseService.ts      ← Horse profile management
│   │       │   ├── rideActivityService.ts← Ride logging/photos
│   │       │   ├── subscriptionService.ts← Subscription management
│   │       │   ├── iapService.ts        ← In-App Purchases (expo-iap)
│   │       │   ├── paymentService.ts    ← Payment processing
│   │       │   ├── couponService.ts     ← Coupon application
│   │       │   ├── filterService.ts     ← Challenge/content filtering
│   │       │   └── index.ts
│   │       ├── components/              ← Reusable UI components
│   │       ├── hooks/                   ← Custom hooks
│   │       ├── providers/               ← Context providers
│   │       ├── schemas/                 ← Zod validation schemas
│   │       ├── types/                   ← TypeScript interfaces
│   │       ├── utils/                   ← Helper functions
│   │       ├── constants/               ← App-wide constants
│   │       ├── assets/                  ← Images, fonts
│   │       ├── __tests__/               ← Test files
│   │       ├── app.config.js            ← Expo config (app name, icons, etc.)
│   │       ├── eas.json                 ← EAS Build profiles
│   │       └── package.json
│   └── shared/                          ← Shared packages across monorepo
└── epona.app.sln                        ← .NET solution file
```

---

## Tech Stack

### Mobile App (epona-app)
| Layer | Technology | Version |
|---|---|---|
| Framework | Expo (React Native) | ~54.0.13 |
| Language | TypeScript | ~5.9.2 |
| Navigation | Expo Router (file-based) | ~6.0.12 |
| Auth | expo-auth-session + Google/Facebook OAuth | — |
| Purchases | expo-iap | 3.x |
| Validation | Zod | 4.x |
| Media | expo-image, expo-image-picker | — |
| Storage | expo-secure-store, AsyncStorage | — |
| Gestures | react-native-gesture-handler | ~2.28.0 |
| Animation | react-native-reanimated | ~4.1.3 |
| Testing | Jest + @testing-library/react-native | 29.x |
| Build | EAS Build (Expo Application Services) | — |

### CMS (epona-admin / Strapi)
| Layer | Technology | Version |
|---|---|---|
| CMS | Strapi | 5.x |
| Database | PostgreSQL (via Docker) | — |
| Language | TypeScript | 5.x |
| Email | @strapi/provider-email-nodemailer | — |
| Auth Plugin | @strapi/plugin-users-permissions | 5.x |

---

## Architecture

```
[Mobile App: Expo React Native]
         ↓
[Node.js Gateway API]  ← Secure intermediary, custom business logic
         ↓
[Strapi CMS REST/GraphQL API]
         ↓
[PostgreSQL Database]
         ↑
[.NET Aspire]  ← Orchestrates all containers (Strapi, DB, PgAdmin, API, App)
```

### Data Models (Strapi Collections)
| Collection | Description |
|---|---|
| `challenge` | Riding challenges with duration, distance, difficulty |
| `challenge-participant` | User ↔ Challenge join records |
| `challenge-eligibility` | Eligibility rules per challenge |
| `badge` | Achievement badges |
| `badge-earner` | Who earned which badge |
| `ride-activity` | Individual ride sessions |
| `ride-activity-photo` | Photos attached to rides |
| `user-horse` | Horse profiles per user |
| `user-discipline` | Disciplines selected by user |
| `subscription` | Active subscriptions |
| `subscription-type` | Free/Pro/Premium tiers |
| `payment` | Payment records |
| `coupon` | Discount codes |
| `difficulty-level` | Beginner/Intermediate/Expert |
| `discipline` | Dressage, Show Jumping, etc. |
| `riding-experience-level` | User skill self-assessment |

---

## Key Services (Mobile)

| Service | Responsibility |
|---|---|
| `authService.ts` | Google, Facebook, Apple sign-in, token refresh |
| `challengeService.ts` | Browse, join, leave, complete challenges |
| `leaderboardService.ts` | Fetch global/friend leaderboards |
| `horseService.ts` | Create, edit, delete horse profiles |
| `rideActivityService.ts` | Log rides, upload photos |
| `subscriptionService.ts` | Manage subscription tiers |
| `iapService.ts` | In-App Purchase via expo-iap |
| `paymentService.ts` | Direct payment processing |

---

## What Can Be Improved

| Area | Current State | Improvement |
|---|---|---|
| **Gateway API** | Node.js (implied) | Fully document and version the gateway API (OpenAPI/Swagger) |
| **Offline Mode** | Not observed | Add React Query persistence + WatermelonDB for offline-first |
| **Push Notifications** | Not confirmed | Add Expo Notifications for challenge reminders, badge alerts |
| **Real-time Leaderboard** | Polling | Implement WebSocket or Supabase Realtime for live rankings |
| **Social Features** | Follow/friend system unclear | Add follower graph, activity feed |
| **Analytics** | Not present | Add Amplitude/PostHog for funnel and engagement analysis |
| **EAS Updates** | eas.json present | Leverage EAS Update for OTA hotfixes without store review |
| **Testing** | Jest configured | Expand test coverage with integration tests for services |

---

---

# 3. Lamima Workflow Management

## Overview

**Repository:** `lamima-software/`  
**Type:** Internal Business Workflow & Project Management System  
**Primary Tech:** Next.js 16 + Prisma ORM + PostgreSQL + NextAuth.js v5  
**Orchestration:** .NET Aspire  

Lamima is a **full-stack web application** for managing business workflows. It acts as an internal tool covering clients, employees, projects, quotations, timesheets, stages, instances, and reports — essentially a full project/operations management platform.

---

## Repository Structure

```
lamima-software/
├── aspire/
│   └── lamima.Aspire.AppHost/         ← .NET Aspire orchestrator
├── docs/                              ← Project documentation
├── lamima-workflow-management/        ← pnpm monorepo (Frontend)
│   ├── apps/
│   │   └── workflow-management/       ← Main Next.js 16 app
│   │       ├── src/
│   │       │   ├── app/               ← Next.js App Router
│   │       │   │   ├── (auth)/        ← Login/register pages
│   │       │   │   ├── (dashboard)/   ← Protected dashboard area
│   │       │   │   │   ├── clients/      ← Client management
│   │       │   │   │   ├── employees/    ← Employee management
│   │       │   │   │   ├── instances/    ← Workflow instances
│   │       │   │   │   ├── notifications/← Notification center
│   │       │   │   │   ├── projects/     ← Project tracking
│   │       │   │   │   ├── quotations/   ← Quote generation
│   │       │   │   │   ├── reports/      ← Analytics/reporting
│   │       │   │   │   ├── settings/     ← System settings
│   │       │   │   │   ├── stages/       ← Pipeline stages
│   │       │   │   │   ├── timesheets/   ← Time tracking
│   │       │   │   │   └── workflows/    ← Workflow designer
│   │       │   │   └── api/           ← Next.js API routes
│   │       │   ├── actions/           ← Next.js Server Actions
│   │       │   ├── components/        ← Reusable UI components
│   │       │   ├── contexts/          ← React context
│   │       │   ├── hooks/             ← Custom hooks
│   │       │   ├── lib/               ← Utilities, config
│   │       │   ├── models/            ← TypeScript model definitions
│   │       │   ├── proxy.ts           ← API proxy setup
│   │       │   ├── repositories/      ← Data access layer
│   │       │   ├── services/          ← Business logic services
│   │       │   ├── styles/            ← Global CSS
│   │       │   └── types/             ← TypeScript types
│   │       ├── prisma/
│   │       │   ├── schema.prisma      ← PostgreSQL schema (14KB!)
│   │       │   └── seed.ts            ← Data seeding
│   │       ├── __tests__/             ← Test files
│   │       ├── next.config.ts
│   │       ├── jest.config.ts
│   │       └── package.json
│   ├── shared/                        ← Shared packages
│   └── src/                           ← Additional source (types?)
└── lamima.workflow-management.sln     ← .NET solution
```

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js | 16.1.6 |
| Language | TypeScript | 5.x |
| Runtime | React | 19.2.3 |
| Styling | TailwindCSS | 4.x |
| Database | PostgreSQL | via Docker |
| ORM | Prisma | 7.3.0 |
| Auth | NextAuth.js | 5.0.0-beta.30 |
| Data Fetching | TanStack React Query | 5.x |
| Table | TanStack React Table | 8.x |
| Forms | React Hook Form + Zod | 7.x / 4.x |
| UI Primitives | Radix UI (Dialog, etc.) | 1.x |
| Animations | tailwindcss-animate | 1.x |
| Toasts | Sonner | 2.x |
| Hashing | bcryptjs | 3.x |
| Class Utility | clsx + class-variance-authority | — |
| Theming | next-themes (dark mode) | 0.4.x |
| Testing | Jest + @testing-library/react | 30.x |
| Dev Server | Turbopack | built-in |
| Package Manager | pnpm (workspace) | — |

---

## Architecture

### Request Flow
```
Browser → Next.js App Router (RSC + Client Components)
                    ↓
         Next.js API Routes / Server Actions
                    ↓
         Repository Layer (Data Access)
                    ↓
         Prisma ORM → PostgreSQL
```

### Key Architectural Patterns
- **Server Components (RSC)** for data fetching without client-side overhead
- **Server Actions** for form submissions and mutations
- **Repository Pattern** — `repositories/` abstracts DB queries from business logic
- **Service Layer** — `services/` contains business logic, calls repositories
- **TanStack Query** for client-side data synchronization and caching
- **NextAuth v5** with Prisma adapter for database-backed sessions
- **Proxy pattern** (`proxy.ts`) for external API routing

### Module Areas (Dashboard)
| Module | Description |
|---|---|
| `clients` | Client CRM — companies and contacts |
| `employees` | HR management — staff profiles, roles |
| `projects` | Project lifecycle tracking |
| `workflows` | Workflow template designer |
| `instances` | Active workflow execution instances |
| `stages` | Pipeline stage definitions |
| `quotations` | Quote generation and approval |
| `timesheets` | Employee time logging |
| `reports` | Analytics dashboards |
| `notifications` | Internal notification system |
| `settings` | System configuration |

---

## What Can Be Improved

| Area | Current State | Improvement |
|---|---|---|
| **Auth** | NextAuth v5 beta | Upgrade to stable NextAuth v5 when released |
| **Real-time** | Not present | Add WebSocket or Pusher for live workflow status updates |
| **Workflow Engine** | Custom | Integrate a proper BPMN engine (e.g., Camunda or Temporal) |
| **File Uploads** | Unknown | Add S3/Azure Blob for document attachment on projects/quotations |
| **Email Notifications** | Not observed | Add nodemailer or Resend for workflow event emails |
| **Role-Based Access** | Unclear depth | Implement granular RBAC for each module |
| **Audit Trail** | Not confirmed | Add audit logging for all mutations (who changed what, when) |
| **Caching** | TanStack Query only | Add Redis for server-side caching of reports/aggregations |
| **Export** | Not confirmed | Add PDF/Excel export for reports and quotations |
| **Mobile** | Web only | Consider a companion Expo app for timesheet logging |

---

---

# 4. Lands Authority Platform

## Overview

**Repository:** `lands-authority/`  
**Type:** Government / Corporate Employee Time Tracking System  
**Primary Tech:** Next.js 15 + Prisma ORM + SQLServer + NextAuth.js v4 + Azure AD B2C  
**Orchestration:** .NET Aspire  

Lands Authority is a **secure enterprise time tracking and employee management system**. It is built for a government or large corporate client requiring strict authentication (Azure AD B2C with e-ID support), role-based access control, and comprehensive audit trails for punch in/out tracking.

---

## Repository Structure

```
lands-authority/
├── aspire/
│   └── lands-authority.Aspire.AppHost/  ← .NET Aspire orchestrator
├── docs/                               ← Architecture docs
├── dotnet/                             ← (Placeholder — minimal)
│   └── README.md
└── lands-authority-web/                ← Frontend monorepo (pnpm workspace)
    ├── apps/
    │   └── lands-authority-app/        ← Main Next.js 15 application
    │       ├── src/
    │       │   ├── app/                ← App Router
    │       │   │   ├── (authenticated)/← Protected area
    │       │   │   │   ├── admin/      ← Admin dashboard
    │       │   │   │   │   ├── employees/      ← Employee CRUD
    │       │   │   │   │   ├── departments/    ← Department management
    │       │   │   │   │   ├── reports/        ← Export & analytics
    │       │   │   │   │   └── settings/       ← Config management
    │       │   │   │   └── employee/   ← Employee self-service
    │       │   │   │       └── dashboard/      ← Punch in/out + history
    │       │   │   ├── api/            ← API routes
    │       │   │   │   ├── punch/      ← POST /api/punch
    │       │   │   │   ├── employees/  ← GET/POST /api/employees
    │       │   │   │   ├── flags/      ← Flag management
    │       │   │   │   ├── reports/    ← Report generation
    │       │   │   │   └── configuration/ ← GET/PUT /api/configuration
    │       │   │   ├── auth/           ← Sign-in pages
    │       │   │   ├── layout.tsx
    │       │   │   └── providers.tsx
    │       │   ├── components/         ← 25+ reusable UI components
    │       │   │   ├── AddEmployeeModal.tsx
    │       │   │   ├── AdminLayout.tsx
    │       │   │   ├── AppHeader.tsx
    │       │   │   ├── EmployeeTable.tsx
    │       │   │   └── SessionTimer.tsx (+ more)
    │       │   ├── generated/          ← Prisma generated client
    │       │   ├── hooks/              ← Custom hooks
    │       │   ├── lib/
    │       │   │   ├── dal/            ← Data Access Layer
    │       │   │   ├── models/         ← TypeScript enums & models
    │       │   │   ├── utils/          ← Utility functions
    │       │   │   ├── auth.ts         ← NextAuth.js configuration
    │       │   │   ├── prisma.ts       ← Singleton Prisma client
    │       │   │   ├── route-guards.ts ← Server-side route protection
    │       │   │   ├── timerUtils.ts   ← Punch timer calculations
    │       │   │   └── workingHoursUtils.ts ← Working hours logic
    │       │   ├── middleware/         ← Next.js middleware logic
    │       │   ├── middleware.ts       ← Next.js edge middleware
    │       │   ├── server/             ← Server-side operations
    │       │   │   ├── cronService.ts  ← Scheduled background jobs
    │       │   │   ├── tasks/          ← Background task definitions
    │       │   │   └── employeeServerOperation.ts
    │       │   ├── services/           ← 8 API service modules
    │       │   │   ├── adminApiService.ts
    │       │   │   ├── configurationService.ts
    │       │   │   ├── departmentService.ts
    │       │   │   ├── employeeApiService.ts
    │       │   │   ├── flagService.ts
    │       │   │   ├── punchHistoryService.ts
    │       │   │   ├── reportService.ts
    │       │   │   └── workingHoursService.ts
    │       │   ├── types/              ← TypeScript types
    │       │   └── workers/            ← Web Workers (timer)
    │       ├── prisma/
    │       │   ├── schema.prisma       ← SQLServer schema
    │       │   └── seed.ts
    │       └── public/                 ← Static assets
    └── shared/                         ← Shared packages
```

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js | 15.x |
| Runtime | React | 19.x |
| Language | TypeScript | 5.x |
| Styling | TailwindCSS | 4.x |
| Database | Microsoft SQL Server | via Docker |
| ORM | Prisma | latest (SQLServer adapter) |
| Auth | NextAuth.js | v4 + Azure AD B2C |
| Enterprise Auth | Azure AD B2C (Government e-ID) | — |
| Background Jobs | Custom cron service | — |
| Web Workers | Browser Web Workers (timer) | — |
| Testing | Jest + React Testing Library | — |
| Orchestration | .NET Aspire | — |
| Containerization | Docker | — |

---

## Database Schema (SQLServer via Prisma)

| Model | Fields | Purpose |
|---|---|---|
| `Employee` | id, roleId, departmentId, firstName, lastName, email, status, lastPunchIn, missedConfirmationCount | Staff profiles |
| `Role` | id, name | Admin / Employee roles |
| `Department` | id, name | Organizational units |
| `PunchHistory` | id, employeeId, dailyWorkingHoursId, status, comment, createdAt | Time tracking records |
| `WorkingHours` | id, startTime, endTime, isActive | Default working schedule |
| `DailyWorkingHours` | id, employeeId, date, startTime, endTime | Per-employee date schedule |
| `Configuration` | id, employeeId, frequency, gracePeriod, missedPunchAlertMinutes | Punch alert settings |
| `FlagConfiguration` | id, employeeId, type, threshold | Absence/lateness flag rules |
| `EmployeeFlag` | id, employeeId, flagId, comment | Applied flags on employees |
| `Account` | NextAuth OAuth accounts | — |
| `User` | NextAuth user records | — |

---

## API Endpoints

| Method | Route | Description |
|---|---|---|
| POST | `/api/punch` | Punch in/out |
| GET | `/api/configuration` | Get alert configuration |
| PUT | `/api/configuration` | Update configuration |
| GET | `/api/employee/profile` | Get own profile |
| GET | `/api/employees` | List all employees (admin) |
| POST | `/api/employees` | Create new employee (admin) |
| GET | `/api/flags` | Get flag configurations |
| POST | `/api/flags` | Create flag |
| GET | `/api/reports` | Generate reports |

---

## Security Architecture

- **Azure AD B2C** — Government e-ID integration for SSO
- **Route Guards** — Server-side `route-guards.ts` blocks unauthorized access before rendering
- **API Token Validation** — Every API endpoint validates the JWT from session
- **Role-Based Access Control** — Admin vs Employee route separation in App Router
- **Cron Job** — Auto-flags employees who miss punch-in confirmations
- **Web Worker** — Offloads timer logic from main thread

---

## Design System

- **Primary Color:** `#00A997` (teal)
- **Secondary:** `#6DC5B9`
- **Tertiary:** `#CCEEEA`
- **Typography:** Inter font, 700/400 weights
- **Components:** 25+ responsive Tailwind components

---

## What Can Be Improved

| Area | Current State | Improvement |
|---|---|---|
| **Real-time Punch Status** | Manual refresh | Add SSE or WebSocket for live punch status |
| **Biometric Auth** | Not present | Add biometric/PIN for mobile employees via companion app |
| **Geofencing** | Not present | GPS-based punch validation (employees must be on-site) |
| **Leave Management** | Not present | Integrate leave request & approval workflows |
| **Payroll Integration** | Not present | Export punch data to payroll systems (QuickBooks, SAP) |
| **Mobile App** | Web only | Expo companion app for mobile punch-in |
| **PDF Reports** | Unknown | Add PDF generation for compliance reports |
| **Audit Trail** | Partial (flags) | Full immutable audit log for all admin actions |
| **Notification System** | Cron only | Add email/SMS alerts for missed punches |
| **Multi-tenancy** | Single-tenant | Architect for multiple departments/organizations |

---

---

# 5. Mediation Centre Portal

## Overview

**Repository:** `mediation-centre-portal/`  
**Type:** Legal Tech — Online Dispute Resolution (ODR) Platform  
**Primary Tech:** Next.js 16 + Express.js Backend + Prisma + SQLServer + Azure MSAL  
**Orchestration:** .NET Aspire (configured)  

The Mediation Centre Portal is a **full-stack legal dispute resolution platform** consisting of three separate applications that work together: a public user portal, an admin back-office, and a dedicated Node.js/Express backend API. The platform enables parties to file cases, select mediators, schedule sittings, exchange messages, and track case progress.

---

## Repository Structure

```
mediation-centre-portal/
├── aspire/                              ← .NET Aspire orchestrator
├── docs/                               ← Documentation
├── dotnet/                             ← (Placeholder)
│   └── README.md
└── mmc-web-portal/                     ← pnpm monorepo
    ├── apps/
    │   ├── mmc-user-portal/            ← Public-facing Next.js 16 portal
    │   │   ├── src/
    │   │   │   ├── app/
    │   │   │   │   ├── [locale]/       ← Internationalized routing (next-intl)
    │   │   │   │   └── api/            ← API routes
    │   │   │   ├── actions/            ← Server Actions
    │   │   │   ├── api/                ← API client functions
    │   │   │   ├── components/         ← UI components
    │   │   │   ├── contexts/           ← React context
    │   │   │   ├── hooks/              ← Custom hooks
    │   │   │   ├── i18n/               ← Internationalization config
    │   │   │   ├── libs/               ← Library wrappers
    │   │   │   └── middleware.ts       ← Auth + i18n middleware
    │   │   ├── messages/               ← i18n translation files
    │   │   ├── prisma/                 ← Direct Prisma access (read-only)
    │   │   └── package.json
    │   │
    │   ├── mmc-back-office/            ← Admin panel (Next.js 16)
    │   │   ├── src/
    │   │   │   ├── app/
    │   │   │   │   ├── [locale]/       ← Internationalized routing
    │   │   │   │   └── api/
    │   │   │   ├── actions/            ← Server Actions
    │   │   │   ├── api/                ← API client functions
    │   │   │   ├── components/         ← Admin UI components
    │   │   │   ├── contexts/
    │   │   │   ├── hooks/
    │   │   │   ├── i18n/               ← i18n config
    │   │   │   ├── libs/
    │   │   │   └── middleware.ts
    │   │   ├── messages/               ← Translation files
    │   │   └── package.json
    │   │
    │   └── mmc-backend/                ← Express.js REST API backend
    │       ├── src/
    │       │   ├── app.ts              ← Express app entry point
    │       │   ├── config/             ← MSAL, JWT, DB configuration
    │       │   ├── controllers/        ← Request handlers
    │       │   │   ├── auth/           ← Authentication controllers
    │       │   │   ├── audit-logs/     ← Audit trail
    │       │   │   ├── case-messages/  ← Case chat/messaging
    │       │   │   ├── case-types/     ← Case category management
    │       │   │   ├── mediator-applications/ ← Mediator registration
    │       │   │   ├── notifications/  ← Notification management
    │       │   │   ├── sitting-schedules/ ← Sitting booking
    │       │   │   ├── user-roles/     ← Role management
    │       │   │   └── users/          ← User management
    │       │   ├── handlers/           ← Middleware handlers
    │       │   ├── middleware/         ← Express middleware
    │       │   ├── routes/             ← Route definitions
    │       │   └── services/           ← Business logic
    │       └── package.json
    │
    └── shared/
        ├── mmc-web-portal-auth/        ← Shared auth library
        ├── mmc-web-portal-commonui/    ← Shared UI components
        └── mmc-web-portal-data/        ← Shared Prisma client & repositories
            ├── client.ts               ← Prisma singleton
            ├── index.ts                ← Exports
            ├── repositories/           ← Data access repositories
            ├── types/                  ← Shared TypeScript types
            └── prisma/
                ├── schema.prisma       ← SQLServer schema (389 lines)
                └── seed.dev.ts         ← Development seeding
```

---

## Tech Stack

### User Portal & Back Office (Next.js)
| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js | 16.x (User Portal), 16.0.1 (Back Office) |
| Runtime | React | 19.2.0 |
| Language | TypeScript | 5.x |
| Styling | TailwindCSS | 4.x |
| Auth | NextAuth.js | v4 |
| i18n | next-intl | 4.4.0 |
| Data Fetching | TanStack React Query | 5.x |
| Tables | TanStack React Table | 8.x |
| Forms | React Hook Form + Zod | — |
| UI | @headlessui/react, classnames | — |
| Toasts | react-toastify | — |
| Dev Server | Turbopack | built-in |

### Backend API (Express.js)
| Layer | Technology | Version |
|---|---|---|
| Framework | Express.js | 5.1.0 |
| Language | TypeScript | 5.x |
| Auth | Azure MSAL Node + JWT + jwks-rsa | — |
| HTTP Proxy | http-proxy-middleware | 3.x |
| Database | Prisma (shared data package) | — |
| Cookie | cookie-parser | 1.x |
| CORS | cors | 2.x |
| Encryption | crypto | — |
| Dev | nodemon + ts-node | — |

---

## Database Schema (SQLServer — 389 Lines)

| Model | Key Fields | Purpose |
|---|---|---|
| `Role` | id, name | public / mediator / admin |
| `User` | id, roleId, documentNumber, title, firstName, lastName, email, isCorporate | Platform users |
| `CaseType` | id, name, description, isActive | Categories of disputes |
| `Case` | id, slug, subject, typeId, mediatorId, firstPartyId, secondPartyId, status, isPaid, mediationFee | Core dispute record |
| `CaseMessage` | id, caseId, userId, message, documentId, createdAt | In-case messaging |
| `UserCaseInformation` | userId, caseId, hasConfirmed, hasFullAuthority, isRepresentedByCounsel | Party details per case |
| `MediatorCaseAcceptance` | id, mediatorId, mediatorAcceptanceStatus, date | Mediator accept/reject |
| `Sitting` | id, caseId, calendarId, datetime | Scheduled mediation sessions |
| `Availability` | id, userId, date, timeslots | Mediator calendar |
| `CaseTermination` | caseId, reason, numberOfSessions, commencementDate, terminationDate | Case closure |
| `MediatorInfo` | languages, specialization, warrantDate, vatNumber, crossBorderExp | Mediator profile |
| `Qualification` | degree, institution, year | Mediator education |
| `Course` | name, organization, duration, completionDate | Training records |
| `FieldOfOperation` | field, reason | Mediator practice areas |
| `Payment` | id, caseId, referenceNumber, method, proofOfPayment | Payment records |
| `CaseDocument` | id, caseId, name, source | Document attachments |
| `AuditLog` | id, userId, entity, action, timestamp, newData, oldData | Full audit trail |
| `NotificationTemplate` | channels, severity, message, recipient | Notification rules |
| `NotificationMessage` | rendered data, readAt, metadata | Sent notifications |
| `MediatorApplication` | userId, mediatorStatus, dateApplied, dateReviewed | Registration workflow |

---

## Architecture

```
[mmc-user-portal: Next.js 16]   [mmc-back-office: Next.js 16]
           ↓                              ↓
    [mmc-backend: Express.js API]  ← Azure MSAL JWT Auth
           ↓
    [mmc-web-portal-data: shared Prisma package]
           ↓
    [SQL Server Database]
           ↑
    [.NET Aspire] ← Orchestrates all containers
```

### Shared Package Architecture
- `mmc-web-portal-data` — Single source of truth for DB access. All apps use this workspace package.
- `mmc-web-portal-auth` — Shared authentication utilities
- `mmc-web-portal-commonui` — Shared React component library

### Internationalization
Both portals use `next-intl` with `[locale]` dynamic segments and a dedicated `messages/` directory for translations.

---

## What Can Be Improved

| Area | Current State | Improvement |
|---|---|---|
| **Real-time Messaging** | Polling/static | Add WebSocket (Socket.IO) for live case chat |
| **Document Storage** | Source field in DB | Add Azure Blob Storage or S3 for actual document files |
| **Calendar Integration** | Custom availability model | Integrate Google Calendar / MS Outlook for mediator scheduling |
| **Payment Gateway** | proofOfPayment field (manual) | Integrate Stripe or Revolut for automated payment |
| **Video Conferencing** | Not present | Add Daily.co or Twilio Video for online sittings |
| **E-Signature** | Not present | Integrate DocuSign or Adobe Sign for case declarations |
| **SMS Notifications** | Not observed | Add Twilio SMS for critical case updates |
| **Mobile App** | Web only | Companion Expo app for case tracking on mobile |
| **Search** | Not observed | Add Elasticsearch or Meilisearch for case/mediator search |
| **Analytics Dashboard** | Not present | Admin analytics on case volume, resolution rates, mediator performance |

---

---

# 6. Thriveon Digital Platform

## Overview

**Repository:** `thriveon-digital-platform/`  
**Type:** Health & Wellness Mobile App + Content Platform  
**Primary Tech:** Expo (React Native) + Strapi CMS + WordPress Plugin + .NET Aspire  

Thriveon is a **comprehensive health and wellness platform** consisting of a mobile app for clients, a Strapi CMS for content administration, and a WordPress plugin for website integration. Users engage with coaching, courses, events, toolkits, and a wellness wizard.

---

## Repository Structure

```
thriveon-digital-platform/
├── aspire/
│   └── ThriveOnPlatform.AppHost/       ← .NET Aspire orchestrator
├── docs/                               ← Documentation
├── dotnet/
│   └── ThriveOnPlatform.AppHost/       ← Aspire .NET project
├── thriveon-admin/                     ← Strapi 5 CMS (Content Management)
│   ├── src/
│   │   ├── admin/                      ← Strapi admin customizations
│   │   ├── api/                        ← Content type APIs
│   │   ├── components/                 ← Strapi components
│   │   ├── data/                       ← Data files
│   │   ├── extensions/                 ← Plugin extensions
│   │   └── index.ts                    ← Bootstrap/register (17KB!)
│   ├── config/                         ← DB, server, plugins config
│   ├── data/                           ← SQLite data (dev)
│   ├── database/                       ← Migrations
│   ├── scripts/
│   │   └── seed.js                     ← Data seeding script
│   └── package.json                    ← Strapi 5.18.0
│
├── thriveon-app/                       ← Expo monorepo (pnpm workspace)
│   ├── apps/
│   │   └── thriveon-client-app/        ← Main Expo React Native app
│   │       ├── app/                    ← Expo Router file-based routing
│   │       │   ├── _layout.tsx         ← Root layout
│   │       │   ├── (auth)/             ← Authentication screens
│   │       │   ├── (inner)/            ← Nested protected screens
│   │       │   ├── (public)/           ← Public screens (onboarding)
│   │       │   ├── (tabs)/             ← Main tab navigation
│   │       │   │   ├── index.tsx       ← Home screen (12KB!)
│   │       │   │   ├── _layout.tsx     ← Tab bar (10KB!)
│   │       │   │   ├── account/        ← Profile & settings
│   │       │   │   ├── coaching/       ← Coaching sessions
│   │       │   │   ├── courses/        ← Course library
│   │       │   │   ├── events/         ← Events calendar
│   │       │   │   ├── toolkit/        ← Wellness toolkit
│   │       │   │   └── thriveon-wizard/← Wellness assessment wizard
│   │       │   ├── (web-integration)/  ← WebView integration for WordPress
│   │       │   └── thriveon-wizard/    ← Wizard entry point
│   │       ├── api/                    ← API client functions
│   │       ├── components/             ← Reusable UI components
│   │       ├── constants/              ← App-wide constants
│   │       ├── assets/                 ← Images, fonts
│   │       ├── hooks/                  ← Custom hooks
│   │       ├── providers/              ← Context providers
│   │       └── package.json
│   └── shared/                         ← Shared packages
│       └── thriveon-data/              ← Shared data types/API
│
└── wordpress-plugin/                   ← WordPress Integration Plugin
    ├── thriveon-app-integration.php    ← Plugin bootstrap
    ├── thriveon-exercise-shortcode.php ← Exercise shortcodes (28KB!)
    ├── thriveon-strapi-client.php      ← PHP Strapi REST client
    └── assets/                         ← Plugin assets
```

---

## Tech Stack

### Mobile App (thriveon-client-app)
| Layer | Technology | Version |
|---|---|---|
| Framework | Expo (React Native) | 54.0.8 |
| Language | TypeScript | ~5.9.2 |
| Navigation | Expo Router (file-based) | ~6.0.6 |
| Forms | React Hook Form + Zod | — |
| Date Handling | date-fns, moment | — |
| Payment | @revolut/checkout | 1.x |
| Image | expo-image, expo-image-picker | — |
| Sharing | expo-sharing | — |
| File System | expo-file-system | — |
| HTML Rendering | react-native-render-html | — |
| Markdown | react-native-markdown-display | — |
| WebView | react-native-webview | 13.x |
| Animations | react-native-reanimated | ~4.1.0 |
| Gradients | expo-linear-gradient | — |
| Auth | expo-auth-session | — |
| Storage | expo-secure-store | — |
| Testing | jest-expo + @testing-library/react-native | — |

### CMS (thriveon-admin / Strapi)
| Layer | Technology | Version |
|---|---|---|
| CMS | Strapi | 5.18.0 |
| Database | SQLite (dev) / PostgreSQL (prod) | — |
| Email | @strapi/provider-email-nodemailer | — |
| Auth Plugin | @strapi/plugin-users-permissions | 5.18.0 |

### WordPress Plugin
| Component | Technology |
|---|---|
| Plugin Bootstrap | PHP |
| Strapi Client | PHP REST client (`thriveon-strapi-client.php`) |
| Exercise Shortcodes | PHP + WordPress shortcode API |
| Integration | `thriveon-app-integration.php` |

---

## Architecture

```
[Thriveon Client App: Expo React Native]
            ↓
    [Strapi 5 CMS REST API]
            ↓
    [PostgreSQL / SQLite DB]

[WordPress Site] ← [WordPress Plugin]
                        ↓
               [Strapi REST API via PHP client]

[.NET Aspire] ← Orchestrates all containers
```

### App Sections

| Tab / Screen | Content |
|---|---|
| Home | Dashboard with personalized wellness feed |
| Coaching | 1:1 coaching session booking/viewing |
| Courses | Video/content course library |
| Events | Events calendar and registration |
| Toolkit | Wellness resources and tools |
| Account | Profile, settings, subscription |
| Thriveon Wizard | Onboarding/assessment wizard |
| Web Integration | WebView for WordPress content |

### WordPress Plugin Features
- **Exercise Shortcodes** (`thriveon-exercise-shortcode.php` — 28KB) — Renders exercise content from Strapi on WordPress pages
- **Strapi PHP Client** — Makes authenticated REST API calls from WordPress to Strapi
- **App Integration** — Deep-link integration between WordPress site and mobile app

### Strapi Setup
- Uses `better-sqlite3` for development (zero config)
- Switches to PostgreSQL for production
- Custom seeding via `scripts/seed.js`
- Email via nodemailer for transactional emails
- `styled-components` for admin UI customizations

---

## What Can Be Improved

| Area | Current State | Improvement |
|---|---|---|
| **Offline Support** | Not confirmed | Add expo-file-system + background sync for offline content |
| **Push Notifications** | Not confirmed | Add Expo Notifications for course reminders, coaching alerts |
| **Payment** | Revolut Checkout | Add Apple Pay / Google Pay for seamless checkout |
| **Video Streaming** | Not confirmed | Integrate Mux or Cloudflare Stream for course videos |
| **Progress Tracking** | Unknown | Gamification — streaks, points, achievements |
| **Social Features** | Not confirmed | Community feed, peer support groups |
| **Analytics** | Not confirmed | User engagement analytics (Mixpanel/Amplitude) |
| **Accessibility** | Unknown | Add VoiceOver/TalkBack support |
| **A/B Testing** | Not present | Feature flags with LaunchDarkly |
| **WordPress Plugin** | PHP shortcodes | Consider headless WordPress or REST API-driven widgets |
| **Content Caching** | Unknown | CDN caching for Strapi media assets (Cloudflare) |

---

---

# 7. Cross-Project Patterns & Shared Observations

## Technology Commonalities

| Pattern | Projects Using It |
|---|---|
| **.NET Aspire** for orchestration | Davinci, Epona, Lamima, Lands, Mediation, Thriveon (ALL) |
| **pnpm workspaces** monorepo | Davinci, Epona, Lamima, Lands, Mediation, Thriveon (ALL) |
| **TypeScript** throughout | ALL |
| **Prisma ORM** | Lamima, Lands, Mediation |
| **SQLServer** database | Lands, Mediation |
| **PostgreSQL** database | Lamima, Mediation (shared-data) |
| **Strapi CMS** | Epona, Thriveon |
| **Expo / React Native** mobile | Epona, Thriveon |
| **Next.js App Router** | Lamima, Lands, Mediation (User + BackOffice) |
| **TailwindCSS** | Davinci (v4), Lamima (v4), Lands (v4), Mediation (v4) |
| **TanStack React Query** | Davinci, Lamima, Mediation |
| **React Hook Form + Zod** | Lamima, Mediation, Thriveon |
| **Jest** testing | ALL |
| **Docker** containers | ALL |
| **Prettier** code formatting | ALL |
| **GitVersion.yml** semantic versioning | ALL |
| **GitHub Actions** CI/CD | ALL (.github/ present) |

---

## Architecture Patterns Used Across Projects

### 1. Monorepo with pnpm Workspaces
Every project uses a pnpm workspace monorepo, with `apps/` for applications and `shared/` for shared packages.

### 2. .NET Aspire for Local Orchestration
All 6 projects use .NET Aspire to launch Docker containers locally — no manual `docker-compose` needed.

### 3. Shared Data Package Pattern (Mediation)
Mediation introduces the most sophisticated version: a `mmc-web-portal-data` shared package containing Prisma schema, repositories, and types — consumed by both Next.js apps and the Express backend.

### 4. Strapi as Headless CMS
Both Epona and Thriveon use Strapi as a content backend, demonstrating a repeatable CMS pattern for content-heavy apps.

### 5. File-Based Routing (Expo Router)
Both Epona and Thriveon use Expo Router's file-based routing — a modern, maintainable pattern for React Native apps.

---

## Gaps & Cross-Project Improvements

| Gap | Recommendation |
|---|---|
| **No Shared Design System** | Create a `@bullshark/ui` shared component library in a monorepo |
| **No Cross-Project API Standards** | Standardize on OpenAPI/Swagger across all backends |
| **No Centralized Auth Service** | Consider Keycloak or Auth0 as a shared identity provider |
| **Inconsistent Testing Coverage** | Establish minimum 80% coverage policy across all projects |
| **No Observability** | Add OpenTelemetry + Grafana/Datadog across all services |
| **No Shared Error Tracking** | Add Sentry to all frontend apps |
| **Documentation Gaps** | READMEs are minimal in most projects — expand with ADRs |
| **No CI/CD Pipelines** | GitHub Actions workflows need to be built out for all projects |
| **No Feature Flag System** | Add LaunchDarkly or Unleash for safe feature rollouts |
| **No API Gateway** | Consider Kong or Azure API Management for cross-service routing |

---

## Summary Table

| Project | Type | Frontend | Backend | DB | Auth | Mobile |
|---|---|---|---|---|---|---|
| **Davinci** | Booking Plugin | React 19 + Vite | External API | N/A | Cookie/unknown | No |
| **Epona** | Social Horse App | Expo RN | Node.js Gateway + Strapi | PostgreSQL | Google/FB/Apple OAuth | Yes (iOS/Android) |
| **Lamima** | Workflow Mgmt | Next.js 16 | Next.js API Routes + Server Actions | PostgreSQL | NextAuth v5 | No |
| **Lands** | Time Tracking | Next.js 15 | Next.js API Routes | SQLServer | NextAuth v4 + Azure AD B2C | No |
| **Mediation** | Legal ODR | Next.js 16 (x2) | Express.js 5 | SQLServer | Azure MSAL + NextAuth v4 | No |
| **Thriveon** | Wellness Platform | Expo RN | Strapi 5 + WP Plugin | SQLite/PostgreSQL | Strapi Users-Permissions | Yes (iOS/Android) |

---

*Document generated by deep workspace analysis across all 6 Bull Shark project repositories.*  
*Last updated: 2026-05-28*
