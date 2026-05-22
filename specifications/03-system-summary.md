# 3. System Summary

## 3.1 High-Level System Goal

OptiRoute Pro automates delivery logistics: it assigns deliveries to drivers using marginal insertion cost analysis, optimizes routes using cheapest-insertion + 2-opt heuristics, and provides fleet visibility through a web dashboard and a mobile driver app. The Setup Tool exists as a standalone desktop utility that deploys the backend server onto target machines.

## 3.2 Core Capabilities

| ID | Capability | Description | Status |
|---|---|---|---|
| CAP-01 | Automated Agent Assignment | Selects optimal driver via marginal insertion cost with busy-driver penalty | IMPLEMENTED |
| CAP-02 | Route Optimization | Greedy insertion TSP + iterative 2-opt segment swaps | IMPLEMENTED |
| CAP-03 | Composite Cost Scoring | Weighted formula: `α·time + β·distance + γ·SLA + δ·load + ε·detour` | IMPLEMENTED |
| CAP-04 | Multi-Provider Distance Matrix | OSRM, GraphHopper, Mapbox with Haversine fallback | IMPLEMENTED |
| CAP-05 | In-Memory LRU Cache | Pairwise travel metrics with TTL and max-entry eviction | IMPLEMENTED |
| CAP-06 | Delivery Lifecycle | Create → assign → pickup → deliver → complete/cancel via stateService primitives and routingEngineService orchestration | IMPLEMENTED |
| CAP-07 | Agent GPS Tracking | Mobile app reports live location; backend stores latest position | IMPLEMENTED |
| CAP-08 | Manager Dashboard | React SPA: overview, tracking, deliveries, routes, analytics, settings | PARTIAL (mock data in KPIs/analytics) |
| CAP-09 | Desktop Installer | Python/tkinter copies server bundle, writes `.env` | IMPLEMENTED |
| CAP-10 | Fleet Re-optimization | VRP solver scheduler for batch re-optimization | STUBBED (never activated) |

## 3.3 System Type

Multi-component platform:
- **Desktop tool** — Python/tkinter, compiled via PyInstaller.
- **Backend service** — Node.js/Express REST API, single-process monolith.
- **Web application** — React SPA served by backend at `/manager/`.
- **Mobile application** — React Native/Expo.

## 3.4 Primary Actors

| Actor | Role | Interface |
|---|---|---|
| Fleet Manager | Monitors drivers, manages deliveries, views analytics | Manager Dashboard (web) |
| Delivery Agent | Views assigned route, marks deliveries complete, triggers pickups | Mobile App |
| System Administrator | Installs server, configures environment | Setup Tool (desktop) |
| External Matrix Provider | Provides road-network distances | HTTP API (OSRM/GraphHopper/Mapbox) |

## 3.5 Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Setup Tool | Python 3, tkinter, shutil, subprocess | 3.x |
| Setup Build | PyInstaller | N/A |
| Backend Runtime | Node.js | ≥ 18 (native fetch required) |
| Backend Framework | Express | 4.x |
| ODM | Mongoose | 8.x |
| Database | MongoDB | Compatible with Mongoose 8 |
| Backend Middleware | Helmet, CORS, Morgan | Latest |
| Frontend Framework | React | 18.3.1 |
| Frontend Build | Vite | 6.3.5 |
| Frontend CSS | TailwindCSS | 4.1.12 |
| Frontend Routing | React Router | 7.13.0 |
| Frontend Charts | Recharts | 2.15.2 |
| Frontend Maps | Leaflet + react-leaflet | 1.9.4 / 5.0.0 |
| Frontend UI Kit | MUI 7, Radix UI, shadcn/ui | Mixed |
| Mobile Framework | React Native | 0.81.5 |
| Mobile Platform | Expo | 54 |
| Mobile Maps | react-native-maps | 1.20.1 |
| Mobile Navigation | React Navigation | 7.x |
| Deployment (VPS) | PM2 | via ecosystem.config.js |
| Deployment (Serverless) | Vercel | via vercel.json |

## 3.6 Deployment Model

| Target | Mechanism | Config |
|---|---|---|
| Local development | `node server.js` or `npm run dev` | `.env` via dotenv |
| VPS production | PM2 process manager | `ecosystem.config.js` (autorestart, 256M max memory) |
| Serverless | Vercel | `vercel.json` (routes to `server.js`) |
| Mobile dev | Expo dev server | `agent/.env` |
| Setup Tool | PyInstaller-compiled `.exe` | Bundled resources |

---

