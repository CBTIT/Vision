# Vision — CBT Revit Analytics Dashboard

An internal analytics dashboard for CBT Digital Practice that surfaces real-time and historical data collected from the CBT Revit plugin. It shows who is active in Revit right now, session and sync histories, model usage, plugin adoption, cloud project data, and per-user breakdowns — all behind a secure JWT-based login.

---

## Table of Contents

1. [Summary](#summary)
2. [Architecture](#architecture)
3. [Tech Stack](#tech-stack)
4. [Backend API Endpoints](#backend-api-endpoints)
5. [Frontend Architecture](#frontend-architecture)
6. [Authentication](#authentication)
7. [Data Models](#data-models)
8. [Environment Variables](#environment-variables)
9. [Local Development Setup](#local-development-setup)
10. [Database Seeding](#database-seeding)

---

## Summary

Vision is a full-stack TypeScript application composed of two independent packages:

| Package     | Purpose                                                                      |
| ----------- | ---------------------------------------------------------------------------- |
| `backend/`  | Express 5 REST API that connects to MongoDB and serves all analytics data    |
| `frontend/` | React 19 SPA built with Vite that consumes the API and renders the dashboard |

Source data (sessions, syncs, heartbeats, plugin use) is written to MongoDB by the CBT Revit plugin. Vision reads that data and presents it in a structured, filterable UI.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  CBT Revit Plugin                       │
│   (writes sessions, syncs, heartbeats to MongoDB)       │
└──────────────────────────┬──────────────────────────────┘
                           │  MongoDB Atlas / local
                           ▼
┌─────────────────────────────────────────────────────────┐
│               Express 5 Backend (Node)                  │
│  Routes → Controllers → Services → Mongoose Models      │
│  Middleware: auth (JWT), CORS, cookie-parser            │
│  Utilities: timeUtils                                   │
└──────────────────────────┬──────────────────────────────┘
                           │  REST / JSON  (/api/*)
                           ▼
┌─────────────────────────────────────────────────────────┐
│            React 19 Frontend (Vite / SPA)               │
│  React Router • Recharts • shadcn/ui • Tailwind         │
│  ┌─────────────────────────────────────────────────┐    │
│  │ App                                             │    │
│  │  ├─ AuthContext (JWT session restore)           │    │
│  │  ├─ DateRangeContext (shared date filter)       │    │
│  │  ├─ HeaderContext (page title / subtitle)       │    │
│  │  ├─ Layout (sidebar + main)                     │    │
│  │  │   ├─ AppSidebar                              │    │
│  │  │   └─ <Outlet> (page components)              │    │
│  │  └─ Pages:                                      │    │
│  │      ├─ Overview (charts, daily counts)         │    │
│  │      ├─ ActiveUsers (live heartbeat view)       │    │
│  │      ├─ AllUsers (per-user analytics)           │    │
│  │      ├─ SessionsSyncsPage (session/sync list)   │    │
│  │      ├─ AllModels (model explorer)              │    │
│  │      ├─ Plugins (plugin adoption)               │    │
│  │      ├─ CloudData (APS project browser)         │    │
│  │      └─ Login (auth form)                       │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

The backend and frontend are completely decoupled. CORS is configured on the backend to accept requests only from the configured frontend origin(s). All protected API routes require a valid JWT stored in an `HttpOnly` cookie.

**Frontend data flow:** Pages call `lib/api.ts` functions → fetch from backend → state is managed locally via `useState` (no global store needed). The `AuthContext` handles session restoration on app load. Filters and date ranges are shared via `DateRangeContext` and passed as query params to the API.

---

## Tech Stack

### Backend

| Technology                      | Version | Role               |
| ------------------------------- | ------- | ------------------ |
| Node.js                         | —       | Runtime            |
| TypeScript                      | ^6      | Language           |
| Express                         | ^5      | HTTP framework     |
| Mongoose                        | ^9      | MongoDB ODM        |
| JSON Web Token (`jsonwebtoken`) | ^9      | Auth tokens        |
| bcryptjs                        | ^3      | Password hashing   |
| cookie-parser                   | ^1.4    | Cookie handling    |
| dotenv                          | ^17     | Environment config |
| tsx / nodemon                   | —       | Dev hot-reload     |

### Frontend

| Technology           | Version | Role                    |
| -------------------- | ------- | ----------------------- |
| React                | ^19     | UI framework            |
| TypeScript           | ~5.8    | Language                |
| Vite                 | ^7      | Build tool / dev server |
| React Router DOM     | ^7      | Client-side routing     |
| Tailwind CSS         | ^4      | Utility-first styling   |
| shadcn/ui + Radix UI | —       | Component library       |
| Recharts             | ^3      | Data visualisation      |
| date-fns             | ^4      | Date utilities          |
| react-day-picker     | ^9      | Date range picker       |
| lucide-react         | ^0.577  | Icons                   |

---

## Backend API Endpoints

Base path: `/api`

All routes **except login and logout** require a valid `authToken` cookie (JWT).

### Common query parameters

| Param    | Type     | Applies to                  | Notes                                          |
| -------- | -------- | --------------------------- | ---------------------------------------------- |
| `page`   | number   | sessions, syncs, plugins    | 1-based page index                             |
| `limit`  | number   | sessions, syncs, plugins    | Page size (max 1000)                           |
| `from`   | ISO date | sessions, syncs, overview, models  | Start of date range filter              |
| `to`     | ISO date | sessions, syncs, overview, models  | End of date range filter                |

---

### Auth — `/api/auth`

| Method | Path                        | Auth | Body / Params                          | Description                                                              |
| ------ | --------------------------- | ---- | -------------------------------------- | ------------------------------------------------------------------------ |
| `POST` | `/api/auth/login`           | —    | `{ email, password }`                  | Login. Sets `authToken` HttpOnly cookie (14-day expiry).                 |
| `POST` | `/api/auth/logout`          | —    | —                                      | Clears the `authToken` cookie.                                           |
| `GET`  | `/api/auth/me`              | 🔒   | —                                      | Returns the authenticated user's profile. Use on app load to restore session. |
| `POST` | `/api/auth/change-password` | 🔒   | `{ oldPassword, newPassword }`         | Changes password. Requires current password for verification.            |
| `PUT`  | `/api/auth/profile-icon`    | 🔒   | —                                      | Updates the user's profile icon.                                         |

---

### Active Users (Heartbeats) — `/api/active`

| Method | Path                          | Auth | Params                               | Description                                            |
| ------ | ----------------------------- | ---- | ------------------------------------ | ------------------------------------------------------ |
| `GET`  | `/api/active/count`           | 🔒   | —                                    | Count of currently active Revit users. Use for a live badge on the sidebar. |
| `GET`  | `/api/active/users`           | 🔒   | —                                    | List of active users and their open documents. Use for the Active Users page. |
| `GET`  | `/api/active/projects`        | 🔒   | —                                    | List of projects with recent heartbeat activity.        |
| `GET`  | `/api/active/project-users`   | 🔒   | `projectName` (string, **required**) | Users active in a specific cloud project.               |

---

### Sessions — `/api/sessions`

Sessions are the core Revit telemetry unit — one session per open/close cycle.

**Query params:** `page`, `limit`, `from`, `to`, `autodeskUserName`, `modelId`, `deviceName`, `cloudProjectName`, `networkConnectionType` (`"wifi"` or `"ethernet"`), `crashOnly` / `crash` (boolean), `liveOnly` / `live` (boolean), `noSyncs` (boolean).

| Method | Path                          | Auth | Usage suggestion                                                    |
| ------ | ----------------------------- | ---- | ------------------------------------------------------------------- |
| `GET`  | `/api/sessions`               | 🔒   | Paginated session list with rich filtering. Powers the Sessions table. |
| `GET`  | `/api/sessions/count`         | 🔒   | Total session count for a date range. Useful for summary badges.     |
| `GET`  | `/api/sessions/filter-options`| 🔒   | Distinct dropdown values (users, projects, models) for the filter bar. Accepts `from`, `to`, `cloudProjectName`, `modelId`. |
| `GET`  | `/api/sessions/:id`           | 🔒   | Single session detail with full sync timeline.                      |

**Usage examples:**
```
GET /api/sessions?from=2026-05-01&to=2026-05-22&crashOnly=true
GET /api/sessions?autodeskUserName=jdoe&networkConnectionType=wifi
GET /api/sessions?modelId=urn:adsk...&liveOnly=true
GET /api/sessions/filter-options?from=2026-01-01&to=2026-06-01
```

---

### Syncs — `/api/syncs`

Sync events represent Revit-to-cloud synchronisation operations.

**Query params:** `page`, `limit`, `from`, `to`, `autodeskUserName`.

| Method | Path                  | Auth | Usage suggestion                                              |
| ------ | --------------------- | ---- | ------------------------------------------------------------- |
| `GET`  | `/api/syncs`          | 🔒   | Paginated sync event list. Powers the Syncs table.            |
| `GET`  | `/api/syncs/count`    | 🔒   | Total sync count for a date range.                            |
| `GET`  | `/api/syncs/:id`      | 🔒   | Single sync event detail.                                     |

---

### Overview — `/api/overview`

Dashboard-level summary endpoints.

| Method | Path                          | Auth | Params                                          | Usage suggestion                                         |
| ------ | ----------------------------- | ---- | ----------------------------------------------- | -------------------------------------------------------- |
| `GET`  | `/api/overview/daily-counts`  | 🔒   | `from` (YYYY-MM-DD), `to` (YYYY-MM-DD)          | Daily session + sync counts for Recharts line charts.    |
| `GET`  | `/api/overview/date-bounds`   | 🔒   | —                                               | Earliest and latest dates in the dataset. Use to initialise date range pickers. |

---

### Models — `/api/models`

| Method | Path                                             | Auth | Params                  | Usage suggestion                                            |
| ------ | ------------------------------------------------ | ---- | ----------------------- | ----------------------------------------------------------- |
| `GET`  | `/api/models`                                    | 🔒   | `from`, `to`           | All Revit models seen across sessions. Powers Models page.  |
| `GET`  | `/api/models/model-warnings`                     | 🔒   | `from`, `to`           | Warning counts per model for the given period.              |
| `GET`  | `/api/models/:modelId/size-history`              | 🔒   | `from`, `to`           | File size time-series for a specific model.                 |
| `GET`  | `/api/models/:modelId/warning-history`           | 🔒   | `from`, `to`           | Warning count time-series for a specific model.             |
| `GET`  | `/api/models/:modelId/summary-history`           | 🔒   | `from`, `to`           | Daily snapshot summary for a specific model.                |

---

### Plugins — `/api/plugins`

| Method | Path                   | Auth | Params                    | Usage suggestion                                          |
| ------ | ---------------------- | ---- | ------------------------- | --------------------------------------------------------- |
| `GET`  | `/api/plugins`         | 🔒   | `page`, `limit`, `pluginName` | Paginated plugin use records.                         |
| `GET`  | `/api/plugins/names`   | 🔒   | —                         | Distinct plugin names for a filter dropdown.              |
| `GET`  | `/api/plugins/count`   | 🔒   | —                         | Total plugin use count for summary badges.                |

---

### Users — `/api/users`

| Method | Path                    | Auth | Params | Usage suggestion                                         |
| ------ | ----------------------- | ---- | ------ | -------------------------------------------------------- |
| `GET`  | `/api/users/summary`    | 🔒   | —      | Per-user aggregate summary (session count, sync count, models). Powers the Users page. |

---

### Cloud Projects (Autodesk APS) — `/api/cloud`

| Method | Path                                               | Auth | Params | Usage suggestion                                      |
| ------ | -------------------------------------------------- | ---- | ------ | ----------------------------------------------------- |
| `GET`  | `/api/cloud/projects`                              | 🔒   | —      | All Autodesk cloud projects grouped by hub. Powers Cloud Data page. |
| `GET`  | `/api/cloud/projects/:hubId/:projectId/details`    | 🔒   | —      | Detailed metadata for a specific cloud project.       |

---

### Autodesk Integration — `/api/autodesk`

| Method   | Path                       | Auth | Params        | Description                                             |
| -------- | -------------------------- | ---- | ------------- | ------------------------------------------------------- |
| `GET`    | `/api/autodesk/auth-url`   | 🔒   | —             | URL to redirect the user to for Autodesk OAuth.         |
| `GET`    | `/api/autodesk/status`     | 🔒   | —             | Whether the user has a valid Autodesk token.            |
| `POST`   | `/api/autodesk/graphql`    | 🔒   | Body: GraphQL | Proxy query to the AEC Data Model API.                  |
| `DELETE` | `/api/autodesk/disconnect` | 🔒   | —             | Revoke stored Autodesk token.                           |

| Method | Path                | Auth | Params                  | Description                        |
| ------ | ------------------- | ---- | ----------------------- | ---------------------------------- |
| `GET`  | `/auth/callback`    | —    | `code`, `state`         | Autodesk OAuth2 callback (not under `/api`). |

---

## Frontend Architecture

```
frontend/src/
├── App.tsx                     Root component with React Router setup
├── main.tsx                   Entry point (ReactDOM.createRoot)
├── index.css                  Tailwind imports + global styles
│
├── components/
│   ├── ui/                    shadcn/ui primitives (button, card, input, etc.)
│   │   ├── avatar.tsx
│   │   ├── button.tsx
│   │   ├── calendar.tsx
│   │   ├── card.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── input.tsx
│   │   ├── popover.tsx
│   │   ├── separator.tsx
│   │   ├── sheet.tsx
│   │   ├── sidebar.tsx
│   │   ├── skeleton.tsx
│   │   └── tooltip.tsx
│   │
│   ├── layout.tsx              Layout shell: sidebar + header + main content
│   ├── app-sidebar.tsx         Left sidebar navigation
│   ├── nav-user.tsx            User avatar / dropdown in sidebar
│   ├── header-context.tsx      Page title / subtitle state
│   │
│   ├── login.tsx               Login page
│   ├── change-password.tsx     Change password dialog
│   ├── edit-profile-icon.tsx   Profile icon editor
│   │
│   ├── overview.tsx            Dashboard charts (daily counts)
│   ├── activeUsers.tsx         Live active user list
│   ├── activeProjects.tsx      Active project list
│   ├── allUsers.tsx            Per-user summary table
│   ├── alModels.tsx            Model explorer
│   ├── modelExplorer.tsx       Single model drill-down
│   ├── modelSummary.tsx        Model summary view
│   ├── sessions-syncs.tsx      Sessions + Syncs table (shared component)
│   ├── plugins.tsx             Plugin usage list
│   ├── cloudData.tsx           Autodesk cloud project browser
│   ├── warnings.tsx            Model warnings view
│   │
│   ├── date-range-context.tsx  Shared date range state (from / to)
│   ├── date-range-filter.tsx   Date range picker UI
│   └── refresh-button.tsx      Manual refresh button
│
├── contexts/
│   └── AuthContext.tsx          JWT session restore + auth state
│
├── hooks/
│   ├── use-auto-refresh.ts     Auto-refresh interval hook
│   ├── use-mobile.ts           Responsive breakpoint detection
│   └── use-theme.ts            Light/dark theme toggle
│
└── lib/
    ├── api.ts                  All backend API calls (fetch wrappers)
    ├── utils.ts                Utility functions (cn, date formatting, etc.)
    └── profile-icons.tsx       Profile icon SVG components
```

### Key patterns

- **No global state store** — each page manages its own state with `useState` / `useReducer`. The only shared state is `AuthContext` (session) and `DateRangeContext` (date filter range shared between header and pages).
- **API layer** — `lib/api.ts` contains all `fetch` calls. Pages import these functions directly. Query parameters are built as objects and serialised by the API module.
- **Shared table** — The Sessions and Syncs pages use the same `sessions-syncs.tsx` component. The URL path (`/sessions` or `/syncs`) determines the mode. Filtering (date, user, project, network type, crash/live, no-syncs) is done server-side via query params.
- **Charts** — All charts use Recharts with consistent theming via Tailwind CSS variables.
- **UI components** — The `components/ui/` folder contains shadcn/ui primitives that are tailored (not raw Radix). All other components use these primitives.

---

## Authentication

JWT-based authentication with HttpOnly cookies.

- **Login**: `POST /api/auth/login` — validates credentials, signs a JWT, and sets it as an `HttpOnly` cookie with a 14-day expiry.
- **Session persistence**: The frontend `AuthContext` calls `GET /api/auth/me` on load to restore the session from the existing cookie.
- **Logout**: `POST /api/auth/logout` — clears the cookie server-side.
- **Protected routes**: The `authMiddleware` on the backend and `ProtectedLayout` on the frontend both independently guard access.
- **Password changes**: Requires the current password to be verified before storing a new bcrypt hash.

---

## Data Models

| Collection          | Mongoose Model   | Description                                     |
| ------------------- | ---------------- | ----------------------------------------------- |
| `revit_sessions`    | `RevitSession`   | One document per Revit session open/close event |
| `revit_sync_events` | `RevitSyncEvent` | One document per Revit-to-cloud sync            |
| `revit_heartbeats`  | `RevitHeartbeat` | Periodic heartbeat from active Revit users      |
| `plugin_use`        | `PluginUse`      | Records of plugin activation per user           |
| `user_mappings`     | `UserMappings`   | Maps Autodesk usernames to full names / emails  |
| `users_registered`  | `UserRegistered` | Dashboard login accounts (email + bcrypt hash)  |

---

## Environment Variables

### Backend (`backend/.env`)

```env
# MongoDB connection string
MONGO_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/<dbname>

# JWT signing secret — use a long random string in production
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Port the API server listens on (default: 3000)
PORT=3000

# Allowed frontend origin(s) for CORS — comma-separated for multiple
FRONTEND_URL=http://localhost:5173
# FRONTEND_URLS=https://vision.cbtarchitects.com,https://staging.cbtarchitects.com
```

### Frontend (`frontend/.env`)

```env
# Base URL of the backend API
VITE_API_URL=http://localhost:3000
```

---

## Local Development Setup

### Prerequisites

- Node.js 18+
- A running MongoDB instance or MongoDB Atlas connection string

### 1. Clone the repository

```bash
git clone <repo-url>
cd Vision
```

### 2. Start the backend

```bash
cd backend
npm install
# Create backend/.env with the variables listed above
npm run dev
# API available at http://localhost:3000
```

### 3. Start the frontend

```bash
cd frontend
npm install
# Create frontend/.env with VITE_API_URL=http://localhost:3000
npm run dev
# App available at http://localhost:5173
```

### Build for production

```bash
# Backend
cd backend
npm run build      # outputs to dist/
npm start          # runs dist/index.js

# Frontend
cd frontend
npm run build      # outputs to dist/
npm run preview    # preview the production build locally
```

---

## Database Seeding

Pre-seeded dashboard user accounts can be created via the seed script:

```bash
cd backend
npm run seed
```

This creates three users (all with password `pw-test1234`):

| Email                        |
| ---------------------------- |
| `vincent@cbtarchitects.com`  |
| `paquette@cbtarchitects.com` |
| `verma@cbtarchitects.com`    |

> **Note:** Change all passwords after first login in any non-development environment.
