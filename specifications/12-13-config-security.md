# 12. Configuration and Environment Specification

## 12.1 Configuration Precedence

| Priority | Source | Mechanism |
|---|---|---|
| 1 (highest) | Environment variables | `process.env.VAR_NAME` |
| 2 | `.env` file | Loaded by `dotenv` at startup |
| 3 | Hardcoded defaults | `routingConfig.js` fallback values |

**Runtime reload:** Not supported. Configuration is read once at module load time. Server restart required for changes.

**Startup validation:** None. Invalid values silently fall back to defaults via `toNumber()` / `toBoolean()` parsers. No startup validation checks or warnings for misconfiguration.

## 12.2 Configuration Inventory

### Server Core

| Name | Type | Default | Required | Sensitive | Used By | Failure If Invalid |
|---|---|---|---|---|---|---|
| `PORT` | number | 3000 | No | No | server.js | Falls back to 3000 |
| `MONGODB_URI` | string | `mongodb://localhost:27017/optiroute-db` | No | Yes | server.js | Falls back to localhost |

### Routing Weights

| Name | Type | Default | Used By | Failure If Invalid |
|---|---|---|---|---|
| `ROUTE_ALPHA` | number | 0.55 | costModelService | Falls back to 0.55 |
| `ROUTE_BETA` | number | 0.20 | costModelService | Falls back to 0.20 |
| `ROUTE_GAMMA` | number | 0.15 | costModelService | Falls back to 0.15 |
| `ROUTE_DELTA` | number | 0.05 | costModelService | Falls back to 0.05 |
| `ROUTE_EPSILON` | number | 0.05 | costModelService | Falls back to 0.05 |

### Routing Parameters

| Name | Type | Default | Used By | Failure If Invalid |
|---|---|---|---|---|
| `ROUTE_EARTH_RADIUS_KM` | number | 6371 | matrixCacheService | Falls back to 6371 |
| `ROUTE_DEFAULT_SPEED_KPH` | number | 35 | matrixCacheService | Falls back to 35 |
| `ROUTE_SERVICE_TIME_MINUTES` | number | 0 | costModelService | Falls back to 0 |
| `ROUTE_SLA_PENALTY_MULTIPLIER` | number | 1 | costModelService | Falls back to 1 |
| `ROUTE_REGION_PRECISION` | number | 100 | matrixCacheService | Falls back to 100 |

### Matrix Provider

| Name | Type | Default | Sensitive | Condition | Failure If Invalid |
|---|---|---|---|---|---|
| `MATRIX_PROVIDER` | string | `haversine` | No | — | Falls back to haversine |
| `MATRIX_BASE_URL` | string | `""` | No | Required if provider ≠ haversine | Provider call fails → haversine fallback |
| `MATRIX_ACCESS_TOKEN` | string | `""` | Yes | Required for Mapbox | Mapbox call fails → haversine fallback |
| `MATRIX_CACHE_TTL_MINUTES` | number | 60 | No | — | Falls back to 60 |
| `MATRIX_CACHE_MAX_ENTRIES` | number | 5000 | No | — | Falls back to 5000 |

### VRP Solver

| Name | Type | Default | Used By | Status |
|---|---|---|---|---|
| `REOPTIMIZE_ORDER_THRESHOLD` | number | 5 | vrpSolverService | STUBBED |
| `REOPTIMIZE_INTERVAL_MINUTES` | number | 15 | vrpSolverService | STUBBED |
| `ORTOOLS_ENABLED` | boolean | false | vrpSolverService | STUBBED |
| `ORTOOLS_TIME_LIMIT_SECONDS` | number | 30 | vrpSolverService | STUBBED |

### Mobile App (`agent/.env`)

| Name | Type | Default | Sensitive |
|---|---|---|---|
| `EXPO_PUBLIC_BACKEND_URL` | string | `http://192.168.0.48:3000` | No |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | string | (set in file) | Yes |
| `EXPO_PUBLIC_AGENT_ID` | string | `driver-001` | No |

## 12.3 Configuration Dependency Impact

| Config | Dependent Behavior | Impact If Missing/Invalid |
|---|---|---|
| `MONGODB_URI` | All data persistence | Silently uses localhost; fails if no MongoDB running |
| `MATRIX_PROVIDER` | Distance matrix source | Falls back to Haversine (no road data) |
| `MATRIX_BASE_URL` | Provider API calls | Provider call returns null → Haversine fallback |
| `ROUTE_ALPHA..EPSILON` | Cost evaluation | Falls back to defaults (silent) |
| `EXPO_PUBLIC_BACKEND_URL` | Mobile → backend connectivity | Mobile app cannot reach server |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | Route polyline rendering | No polyline drawn on mobile map |
| `EXPO_PUBLIC_AGENT_ID` | Agent identity | Wrong agent identity used |

## 12.4 Sensitive Configuration Handling

| Data | Committed to Git? | Protection |
|---|---|---|
| Server `.env` | No (in `.gitignore`) | File-level access control |
| `MATRIX_ACCESS_TOKEN` | No | In `.env` |
| `MONGODB_URI` | No | In `.env` |
| `agent/.env` (Google Maps key) | **Yes** ⚠️ | Not protected — security concern |
| `.env.example` | Yes (template only) | Contains placeholder values |

---

# 13. Security and Trust Specification

## 13.1 Authentication Model

**Status:** PLANNED — not implemented.

No authentication mechanism exists. All API endpoints are publicly accessible without credentials, tokens, or API keys.

## 13.2 Authorization Model

**Status:** PLANNED — not implemented.

No role-based access control. No permission checks. Any client can perform any operation (create agents, assign deliveries, delete pickups, etc.).

## 13.3 Trust Boundaries

| Boundary | From → To | Trust Level | Verification |
|---|---|---|---|
| Client → Backend API | Any HTTP client → Express | Untrusted | None |
| Backend → MongoDB | Express → Mongoose | Trusted | Connection string |
| Backend → Matrix Provider | Express → OSRM/GH/Mapbox | Untrusted | HTTPS only |
| Mobile → Google APIs | Expo app → Google | Untrusted | API key (in URL) |
| Mobile → Backend | Expo app → Express | Untrusted | None |
| Dashboard → Backend | React app → Express (proxied) | Untrusted | None (same-origin in prod) |

## 13.4 Security Controls

| Control | Status | Implementation |
|---|---|---|
| Helmet Security Headers | IMPLEMENTED | Custom CSP (allows unsafe-inline, OpenStreetMap, Unsplash) |
| CORS | IMPLEMENTED (insecure) | `cors()` — all origins allowed |
| Input Validation | PARTIAL | Manual field-presence checks; no schema/type validation |
| Rate Limiting | PLANNED | Not implemented |
| HTTPS Enforcement | PLANNED | Not enforced; HTTP in development |
| Authentication | PLANNED | Not implemented |
| NoSQL Injection Protection | PARTIAL | Mongoose provides some ORM-level protection |
| Audit Trails | PLANNED | Not implemented |
| API Key Rotation | PLANNED | No key management system |

## 13.5 Threat / Risk Assessment

| ID | Threat | Severity | Mitigation | Status |
|---|---|---|---|---|
| SEC-001 | Open API — any client can modify all data | High | Implement authentication | PLANNED |
| SEC-002 | GPS spoofing — agent location accepted without verification | Medium | Location validation | PLANNED |
| SEC-003 | Committed API key — Google Maps key in `agent/.env` | High | Move to `.gitignore`, rotate key | Not started |
| SEC-004 | No rate limiting — susceptible to abuse | Medium | Implement rate limiter | PLANNED |
| SEC-005 | CORS allows all origins | Medium | Restrict to known origins | PLANNED |
| SEC-006 | Mapbox token in URL query params | Low | Use header-based auth | PLANNED |
| SEC-007 | No HTTPS enforcement | Medium | Configure TLS termination | PLANNED |

---

