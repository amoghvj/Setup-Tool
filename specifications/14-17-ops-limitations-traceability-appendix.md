# 14. Operational and Observability Specification

## 14.1 Logging

| Layer | Mechanism | Format | Destination | Status |
|---|---|---|---|---|
| HTTP Requests | Morgan middleware | `combined` (Apache-style) | stdout | IMPLEMENTED |
| MongoDB connection | `console.log` | Unstructured | stdout | IMPLEMENTED |
| Server startup | `console.log` | Unstructured | stdout | IMPLEMENTED |
| Port-in-use error | `console.error` | Unstructured | stderr | IMPLEMENTED |
| VRP scheduler errors | Silently swallowed | None | Nowhere | IMPLEMENTED (intentional) |
| Application errors | Route handler catch blocks | `{ error: message }` JSON | HTTP response only | IMPLEMENTED |
| Structured logging lib | Not used | — | — | PLANNED |

**Gaps:** No log levels. No log rotation. No correlation IDs. No request tracing. No audit logging.

## 14.2 Monitoring and Health Checks

| Capability | Status |
|---|---|
| Health check endpoint (`/health`) | PLANNED |
| Readiness endpoint (`/ready`) | PLANNED |
| Metrics collection (Prometheus, etc.) | PLANNED |
| APM integration | PLANNED |
| Uptime monitoring | PLANNED |
| Alerting | PLANNED |

**Current liveness signal:** Server startup log message ("Server running on port X").

## 14.3 Recovery and Resilience

### Failure Modes

| Failure | Component | Behavior | Recovery | Severity |
|---|---|---|---|---|
| MongoDB connection failure | Backend | Logs error, continues running. All API data calls return 500. | Restart server after MongoDB restored. | Critical |
| Port already in use | Backend | Logs error, `process.exit(1)`. | Change port or kill conflicting process. | Critical |
| Matrix provider API failure | matrixCacheService | Silently falls back to Haversine estimation. | Automatic — no intervention needed. | Low |
| Matrix provider returns invalid data | matrixCacheService | Individual entries fall back to Haversine per-pair. | Automatic. | Low |
| Google Directions API failure | Mobile app | `buildRoutePolyline` returns `[]`. No polyline drawn. | Manual retry (next poll cycle). | Medium |
| Backend unreachable from mobile | Mobile app | Catches fetch error, logs to console. No retry/backoff. | Automatic on next poll. | Medium |
| Backend unreachable from dashboard | Dashboard | `console.error`, `isLoading` set to false. No retry. | Manual page refresh. | Medium |
| PM2 process crash | Backend (VPS) | PM2 `autorestart: true` restarts process. Max memory 256M triggers restart. | Automatic. | Low |
| MongoDB transaction failure | stateService | Session aborted, error propagated. No partial writes. | Automatic — caller retries or returns error. | Medium |
| In-memory cache corruption | matrixCacheService | N/A — cache is a simple Map, not corruptible. | Restart clears cache. | N/A |

### Fallback Execution Paths

| Primary Path | Fallback Path | Trigger |
|---|---|---|
| OSRM matrix → road distances | Haversine estimation | OSRM call fails or returns null |
| GraphHopper matrix → road distances | Haversine estimation | GraphHopper call fails |
| Mapbox matrix → road distances | Haversine estimation | Mapbox call fails |
| Road matrix entry for pair | Haversine for that specific pair | Individual entry missing/invalid |
| Matrix `.get()` method | Matrix Map `.get()` → object property | Polymorphic lookup in costModelService |
| Google Directions polyline | Empty route (`[]`) | API error or no routes returned |
| Agent location from AgentLocation doc | Fallback coords (40.7128, -74.0060) | No location document found (dashboard) |

### Rollback Behavior

| Operation | Rollback Mechanism | Scope |
|---|---|---|
| Multi-document mutations (pickup, complete, cancel) | MongoDB transaction abort via `finalizeSession` | All writes within session |
| Single-document writes (location upsert, agent create) | MongoDB transaction abort | Single write |
| In-memory cache writes | No rollback — cache state persists | Per-entry |
| SystemState sync | No rollback — runs outside transaction | Global |
| File copy (Setup Tool) | No rollback — partial copies remain | Filesystem |

### Degraded Mode Behavior

| Scenario | Subsystems Affected | Behavior |
|---|---|---|
| MongoDB down | All API endpoints | Server runs but returns 500 on all data operations |
| Matrix provider down | Route optimization | Routes optimized using Haversine (less accurate, faster) |
| Google API down | Mobile app only | Map renders without polyline; markers still visible |
| Backend down | Mobile + Dashboard | Mobile shows stale data; Dashboard shows loading/error |
| No agents registered | Delivery creation | Assignment fails (no candidates) → 500 error |

---

# 15. Constraints, Limitations, and Known Issues

## 15.1 Current Limitations

| ID | Limitation | Impact | Mitigation |
|---|---|---|---|
| LIM-001 | No authentication/authorization | All endpoints publicly accessible | Implement auth layer |
| LIM-002 | Single-process architecture | No horizontal scaling | Add clustering or worker threads |
| LIM-003 | In-memory cache only | Lost on restart, not shared across instances | Use Redis or similar |
| LIM-004 | No real-time push | Dashboard stale after initial load; mobile polls every 5s | Implement WebSocket/SSE |
| LIM-005 | No delivery status field | Cannot query by status without aggregation | Add explicit status field |
| LIM-006 | No pagination | GET endpoints return all documents | Add limit/offset params |
| LIM-007 | No agent deletion | Cannot remove decommissioned agents | Add delete endpoint |
| LIM-008 | No agent display names | Agents identified only by `agentId` | Add name field to schema |
| LIM-009 | Dashboard partially mocked | KPIs/analytics show fake data | Replace mock data with API calls |
| LIM-010 | Setup Tool placeholder vars | Real config vars not in installer UI | Expose actual vars |
| LIM-011 | No graceful shutdown | In-flight requests dropped on restart | Add shutdown handler |
| LIM-012 | No input schema validation | Type errors possible at runtime | Add Joi/Zod validation |

## 15.2 Technical Debt

| ID | Item | Severity | Description |
|---|---|---|---|
| TD-003 | Committed API key | High | `agent/.env` contains Google Maps API key tracked by Git. |
| TD-004 | CommonJS throughout | Medium | Server uses `require()`; limits modern tooling. |
| TD-005 | No input sanitization | Medium | Request bodies used with minimal validation. |
| TD-006 | Dual data model (pointers + arrays) | Medium | Delivery prev/next pointers duplicate Agent array information. |
| TD-007 | Frontend package name | Low | `@figma/my-make-file` — leftover from Figma Make template. |
| TD-008 | Mock data not removed | Medium | `mock-data.ts` still used by UI components alongside live data hook. |
| TD-009 | No structured logging | Medium | Only `console.log` — no levels, no correlation. |
| TD-010 | No health check | Medium | No liveness/readiness probe for orchestrators. |

## 15.3 Known Issues

| ID | Issue | Severity | Status |
|---|---|---|---|
| BUG-003 | CORS allows all origins | Medium | Known, accepted for dev |
| BUG-004 | Google Maps API key exposed in Git | High | Known, not fixed |
| BUG-005 | SystemState sync runs outside transaction — crash between transaction commit and sync leaves inconsistent global state | Low | Known, accepted |

## 15.4 Recommended Fixes

| ID | Fix | Priority | Effort |
|---|---|---|---|
| FIX-003 | Add `agent/.env` to `.gitignore`, rotate Google Maps API key | High | Low |
| FIX-004 | Add CORS origin whitelist | Medium | Low |
| FIX-005 | Replace mock data in dashboard with API calls | Medium | Medium |
| FIX-006 | Add health check endpoint | Medium | Low |

---

# 16. Traceability and Coverage Matrix

## 16.1 Full Requirement Coverage

| Req | Endpoint | Service | Model | Test | Frontend | Mobile | Status |
|---|---|---|---|---|---|---|---|
| FR-001 | ✅ | ✅ | ✅ | ❌ | — | ✅ (auto-reg) | IMPLEMENTED |
| FR-002 | ✅ | ✅ | ✅ | ❌ | — | — | IMPLEMENTED |
| FR-003 | ✅ | ✅ | ✅ | ❌ | — | ✅ (button) | IMPLEMENTED |
| FR-004 | ✅ | ✅ | ✅ | ❌ | — | ✅ (button) | IMPLEMENTED |
| FR-005 | ✅ | ✅ | ✅ | ❌ | — | — | IMPLEMENTED |
| FR-006 | ✅ | ✅ | ✅ | ❌ | — | ✅ (auto) | IMPLEMENTED |
| FR-007 | ✅ | ✅ | ✅ | ❌ | — | — | IMPLEMENTED |
| FR-008 | ✅ | ✅ | ✅ | ❌ | — | — | IMPLEMENTED |
| FR-009 | N/A | ✅ | N/A | ❌ | — | — | IMPLEMENTED |
| FR-010 | ✅ | ⚠️ | N/A | ❌ | ✅ | — | PARTIAL |
| FR-011 | N/A | N/A | N/A | ❌ | — | ✅ | IMPLEMENTED |

## 16.2 Dependency Ownership Mapping

| Module | Owns | Depends On |
|---|---|---|
| stateService | Agent CRUD, Delivery CRUD, queue mutation, pointer sync, location upsert, pickup CRUD | Mongoose models |
| assignmentService | Agent selection algorithm, marginal cost evaluation | stateService, matrixCacheService, routingEngineService |
| deliveryService | Delivery lifecycle orchestration, global state sync | stateService, assignmentService, routingEngineService |
| routingEngineService | Route construction/optimization orchestration | matrixCacheService, costModelService, strategies |
| costModelService | Cost formula evaluation, SLA penalty | routingConfig, matrixCacheService |
| matrixCacheService | Matrix generation, provider integration, caching | routingConfig |
| vrpSolverService | Fleet optimization, scheduler | routingConfig, routingEngineService |
| server.js | HTTP routing, middleware pipeline, MongoDB connection | All services |

## 16.3 Gap Summary

| Area | Gap | Impact |
|---|---|---|
| Authentication | No auth on any endpoint | Security vulnerability |
| Observability | No metrics, health checks, or structured logging | Operational blindness |
| Data pagination | Unbounded result sets | Performance risk at scale |
| Real-time communication | No push mechanism (WebSocket/SSE) | Dashboard shows stale data |
| Graceful shutdown | No shutdown handler | Data loss risk on restart |
| Input validation | No schema validation library | Type errors at runtime |

---

# 17. Appendix

## 17.1 Glossary

| Term | Definition |
|---|---|
| Agent | A delivery driver registered in the system |
| Active Deliveries | Deliveries currently being executed by an agent (ordered route) |
| Pending Pickup Deliveries | Deliveries assigned to an agent but not yet physically collected |
| Delivery (DeliveryAssignment) | A single delivery task with destination coordinates |
| Pickup Location | A static warehouse/hub where agents collect deliveries |
| Marginal Insertion Cost | Additional cost incurred by inserting a new stop into an existing route |
| 2-Opt | Local search optimization that improves routes by reversing segments |
| Cheapest Insertion | Greedy heuristic that builds routes by inserting at lowest-cost position |
| Travel Matrix | Pairwise distance/time matrix between all stops |
| Haversine | Great-circle distance formula for lat/lng pairs |
| VRP | Vehicle Routing Problem — fleet-level route optimization |
| Setup Tool | Python/tkinter desktop installer application |
| Pointer Sync | Process of rebuilding prev/next linked-list pointers from array order |
| NormalizedStop | Canonical stop format: `{ id, lat, lng, regionBucket, raw }` |
| Route Fingerprint | JSON hash of delivery orderIds + pickup location; used to detect route changes |

## 17.2 Acronyms

| Acronym | Meaning |
|---|---|
| API | Application Programming Interface |
| CORS | Cross-Origin Resource Sharing |
| CSP | Content Security Policy |
| GPS | Global Positioning System |
| LRU | Least Recently Used |
| ODM | Object-Document Mapper |
| OSRM | Open Source Routing Machine |
| PM2 | Process Manager 2 |
| REST | Representational State Transfer |
| SLA | Service Level Agreement |
| SPA | Single Page Application |
| TSP | Travelling Salesman Problem |
| TTL | Time To Live |
| VRP | Vehicle Routing Problem |
| CJS | CommonJS (module system) |
| ESM | ECMAScript Modules |
| RN | React Native |

## 17.3 References

| Reference | Location |
|---|---|
| Project README | `README.md` |
| Server .env example | `resources/server/.env.example` |
| Frontend README | `resources/server/frontend/README.md` |
| Figma Design Source | `https://www.figma.com/design/19X3ubFrS4JKm8aSqxHPmL/` |
| PM2 Config | `resources/server/ecosystem.config.js` |
| Vercel Config | `resources/server/vercel.json` |
| Installed App README | `installed/SetupTool/README.txt` |
| PyInstaller Spec | `SetupTool.spec` |

## 17.4 Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0.0 | 2026-05-15 | Antigravity (AI) | Initial specification from codebase analysis |
| 1.1.0 | 2026-05-15 | Antigravity (AI) | Normalized formatting, standardized status taxonomy, expanded runtime analysis, added internal interfaces, failure analysis, data lifecycle, traceability matrices, boundary definitions |

## 17.5 Open Architectural Questions

| ID | Question | Context |
|---|---|---|
| OQ-002 | Should the Setup Tool expose real routing config vars? | Currently only placeholder names are configurable |
| OQ-003 | Is the `agent/.env` API key commit intentional? | Appears to be development convenience but poses security risk |
| OQ-004 | Should the VRP scheduler be activated? | Code exists but is never called from server startup |
| OQ-005 | Should mock data be fully replaced in dashboard? | Unclear if mock data is kept for demo/testing or is an incomplete migration |
| OQ-006 | Should delivery status be stored explicitly? | Current derived-status model prevents direct status queries |
| OQ-007 | Should pointer fields (prev/next) be removed? | They duplicate array ordering and add maintenance overhead |
| OQ-008 | Is the CommonJS → ESM migration planned? | Referenced in past conversations but not started |

## 17.6 Status Taxonomy Reference

All status labels used in this document follow this normalized taxonomy:

| Status | Definition |
|---|---|
| IMPLEMENTED | Fully functional, code complete, no known defects |
| PARTIAL | Some functionality works; gaps or mock data remain |
| BROKEN | Code exists but fails at runtime due to defects |
| STUBBED | Interface/scaffold exists but core logic is a no-op |
| DEPRECATED | Superseded by newer implementation |
| EXPERIMENTAL | Prototype/proof-of-concept, not production-ready |
| PLANNED | Intended but no code exists |
| LEGACY | Outdated code still present but not actively used |

---

