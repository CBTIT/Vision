# Vision — CBT Revit Analytics Dashboard

An internal analytics dashboard for CBT Digital Practice that surfaces real-time and historical data collected from the CBT Revit plugin. It shows who is active in Revit right now, session and sync histories, model usage, plugin adoption, cloud project data, and per-user breakdowns — all behind a secure JWT-based login.

---

## Table of Contents

1. [Summary](#summary)
2. [Architecture](#architecture)
3. [Tech Stack](#tech-stack)
4. [Backend API Endpoints](#backend-api-endpoints)
5. [Frontend Pages & Routes](#frontend-pages--routes)
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

Source data (sessions, syncs, heartbeats, plugin use) is written to MongoDB by the CBT Revit plugin itself. Vision reads that data and presents it in a structured, filterable UI.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  CBT Revit Plugin                   │
│   (writes sessions, syncs, heartbeats to MongoDB)   │
└────────────────────────┬────────────────────────────┘
                         │  MongoDB Atlas / local
                         ▼
┌─────────────────────────────────────────────────────┐
│               Express 5 Backend (Node)              │
│  Routes → Controllers → Services → Mongoose Models  │
│              JWT auth via HttpOnly cookies          │
└────────────────────────┬────────────────────────────┘
                         │  REST / JSON  (/api/*)
                         ▼
┌─────────────────────────────────────────────────────┐
│            React 19 Frontend (Vite / SPA)           │
│   React Router • Recharts • shadcn/ui • Tailwind    │
└─────────────────────────────────────────────────────┘
```

The backend and frontend are completely decoupled. CORS is configured on the backend to accept requests only from the configured frontend origin(s). All protected API routes require a valid JWT stored in an `HttpOnly` cookie.

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

All routes marked **🔒** require a valid `authToken` cookie (JWT).

### Auth — `/api/auth`

| Method | Path                        | Auth | Description                                                                        |
| ------ | --------------------------- | ---- | ---------------------------------------------------------------------------------- |
| `POST` | `/api/auth/login`           | —    | Login with `email` + `password`. Sets `authToken` HttpOnly cookie (14-day expiry). |
| `POST` | `/api/auth/logout`          | —    | Clears the `authToken` cookie.                                                     |
| `GET`  | `/api/auth/me`              | 🔒   | Returns the authenticated user's profile.                                          |
| `POST` | `/api/auth/change-password` | 🔒   | Changes password (requires `oldPassword` + `newPassword`).                         |
| `PUT`  | `/api/auth/profile-icon`    | 🔒   | Updates the user's profile icon.                                                   |

### Active Users — `/api/active`

| Method | Path                | Description                                                  |
| ------ | ------------------- | ------------------------------------------------------------ |
| `GET`  | `/api/active/count` | Count of currently active Revit users (based on heartbeats). |
| `GET`  | `/api/active/users` | List of currently active users and their open documents.     |

### Sessions — `/api/sessions`

Supports `from` / `to` query params (ISO dates) for date filtering.

| Method | Path                  | Description                         |
| ------ | --------------------- | ----------------------------------- |
| `GET`  | `/api/sessions`       | Paginated list of Revit sessions.   |
| `GET`  | `/api/sessions/count` | Total session count.                |
| `GET`  | `/api/sessions/:id`   | Single session by MongoDB ObjectId. |

### Syncs — `/api/syncs`

Supports `from` / `to` query params for date filtering.

| Method | Path               | Description                          |
| ------ | ------------------ | ------------------------------------ |
| `GET`  | `/api/syncs`       | Paginated list of Revit sync events. |
| `GET`  | `/api/syncs/count` | Total sync event count.              |

### Overview — `/api/overview`

| Method | Path                         | Description                                      |
| ------ | ---------------------------- | ------------------------------------------------ |
| `GET`  | `/api/overview/daily-counts` | Daily session + sync counts for chart rendering. |
| `GET`  | `/api/overview/date-bounds`  | Earliest and latest dates in the dataset.        |

### Plugins — `/api/plugins`

| Method | Path                 | Description                  |
| ------ | -------------------- | ---------------------------- |
| `GET`  | `/api/plugins`       | List of plugin use records.  |
| `GET`  | `/api/plugins/count` | Count of plugin use records. |

### Users — `/api/users`

| Method | Path                 | Description                                 |
| ------ | -------------------- | ------------------------------------------- |
| `GET`  | `/api/users/summary` | Per-user summary (sessions, syncs, models). |

### Models — `/api/models`

| Method | Path          | Description                                    |
| ------ | ------------- | ---------------------------------------------- |
| `GET`  | `/api/models` | List of all Revit models seen across sessions. |

### Cloud — `/api/cloud`

| Method | Path                                            | Description                                 |
| ------ | ----------------------------------------------- | ------------------------------------------- |
| `GET`  | `/api/cloud/projects`                           | List of Autodesk cloud projects.            |
| `GET`  | `/api/cloud/projects/:hubId/:projectId/details` | Detailed info for a specific cloud project. |

---

## Frontend Pages & Routes

| Path            | Component           | Description                                            |
| --------------- | ------------------- | ------------------------------------------------------ |
| `/login`        | `Login`             | Login form. Unauthenticated users are redirected here. |
| `/`             | `Overview`          | Summary charts — daily session/sync counts.            |
| `/active-users` | `ActiveUsers`       | Live view of users currently in Revit.                 |
| `/users`        | `AllUsers`          | Per-user analytics summary table.                      |
| `/sessions`     | `SessionsSyncsPage` | Revit session history with date filtering.             |
| `/syncs`        | `SessionsSyncsPage` | Revit sync event history with date filtering.          |
| `/models`       | `AllModels`         | All Revit models seen across all sessions.             |
| `/plugins`      | `Plugins`           | Plugin adoption / usage records.                       |
| `/cloud-data`   | `CloudData`         | Autodesk cloud project browser.                        |

All routes under `/` are protected. Unauthenticated requests are redirected to `/login`.

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
