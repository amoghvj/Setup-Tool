# 2. Purpose and Scope

## 2.1 Purpose of the Document

This specification describes the **current implemented state** of the OptiRoute Pro system. It serves as the authoritative reference for what the system actually does, how it is built, and where implementation diverges from documented intent. It is optimized for LLM consumption via normalized, repeatable structural patterns.

## 2.2 Scope of the System

The OptiRoute Pro system consists of four interconnected subsystems:

| Subsystem | Type | Purpose |
|---|---|---|
| **Setup Tool** | Python/tkinter desktop app | Deploys the server component to a user's machine |
| **Backend Server** | Node.js/Express REST API | Manages agents, deliveries, routing optimization, pickups |
| **Manager Dashboard** | React/Vite SPA (at `/manager/`) | Logistics management UI with data visualization |
| **Agent Mobile App** | React Native/Expo mobile app | Driver-facing GPS tracking, route visualization, delivery actions |

## 2.3 Out of Scope

- Real-time push notifications (no WebSocket or SSE).
- User authentication and authorization.
- Payment processing or invoicing.
- Customer-facing tracking interfaces.
- Multi-tenancy or organization-level separation.
- Offline-first mobile functionality.

## 2.4 Audience

- Developers maintaining or extending the system.
- LLM-based analysis tools consuming this specification.
- Reviewers evaluating system architecture.

## 2.5 Reading Guidance

1. **Section 3** — High-level system shape.
2. **Section 5** — What is actually built vs. planned (start here for reality check).
3. **Sections 6–7** — Architecture and module deep-dive.
4. **Section 9** — All REST endpoints and internal service contracts.
5. **Section 10** — Runtime lifecycle and execution flows.
6. **Section 15** — Known issues and technical debt.

---

