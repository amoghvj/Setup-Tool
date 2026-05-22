# 8. Data Model Specification

## 8.1 Entity Inventory

| Entity | Collection | Location | Status |
|---|---|---|---|
| Agent | `agents` | `models/Agent.js` | IMPLEMENTED |
| AgentLocation | `agentlocations` | `models/AgentLocation.js` | IMPLEMENTED |
| DeliveryAssignment | `deliveryassignments` | `models/DeliveryAssignment.js` | IMPLEMENTED |
| PickupLocation | `pickuplocations` | `models/PickupLocation.js` | IMPLEMENTED |
| SystemState | `systemstates` | `models/SystemState.js` | IMPLEMENTED |

---

## 8.2 Entity Definitions

### Agent

| Field | Type | Required | Default | Indexed | Description |
|---|---|---|---|---|---|
| `agentId` | String | Yes | — | Yes (unique) | External identifier |
| `activeDeliveries` | ObjectId[] | No | [] | No | Ordered active route (ref: DeliveryAssignment) |
| `pendingPickupDeliveries` | ObjectId[] | No | [] | No | Pending pickup queue (ref: DeliveryAssignment) |
| `nextPickupLocation` | { lat: Number, lng: Number } | No | null | No | Next pickup hub coordinates |
| `createdAt` | Date | Auto | — | No | Mongoose timestamp |
| `updatedAt` | Date | Auto | — | No | Mongoose timestamp |

**Invariants:**
- `agentId` is unique across all agents.
- Array ordering is the single source of truth for route sequence.
- `pendingPickupDeliveries` is append-only until pickup processing.
- A delivery ID may appear in at most one array across all agents.

### AgentLocation

| Field | Type | Required | Default | Indexed | Description |
|---|---|---|---|---|---|
| `agentId` | String | Yes | — | Yes (unique) | External identifier (no Mongoose ref) |
| `location.lat` | Number | Yes | — | No | Latitude |
| `location.lng` | Number | Yes | — | No | Longitude |
| `updatedAt` | Date | No | Date.now | No | Last report time |

**Invariants:**
- At most one location document per `agentId` (upsert semantics).
- No referential integrity enforcement between Agent and AgentLocation (string match only).

### DeliveryAssignment

| Field | Type | Required | Default | Indexed | Description |
|---|---|---|---|---|---|
| `orderId` | String | No | — | Yes (sparse) | External order identifier |
| `agentId` | String | No | null | No | Assigned agent (null = unassigned) |
| `destination.lat` | Number | Yes | — | No | Delivery latitude |
| `destination.lng` | Number | Yes | — | No | Delivery longitude |
| `prevDeliveryId` | ObjectId | No | null | No | Pointer to previous delivery (derived) |
| `nextDeliveryId` | ObjectId | No | null | No | Pointer to next delivery (derived) |
| `createdAt` | Date | Auto | — | No | Mongoose timestamp |
| `updatedAt` | Date | Auto | — | No | Mongoose timestamp |

**Invariants:**
- Status is NOT stored — derived from queue membership (see Section 10.2).
- Pointer fields are derived from Agent arrays; rebuilt by `_syncPointersFromArray` on every mutation.
- A delivery with non-null `agentId` cannot be deleted.
- `orderId` sparse index allows null/missing values without conflict.

### PickupLocation

| Field | Type | Required | Default | Indexed | Description |
|---|---|---|---|---|---|
| `pickupId` | String | Yes | — | Yes (unique) | External pickup identifier |
| `name` | String | Yes | — | No | Human-readable name |
| `location.lat` | Number | Yes | — | No | Latitude |
| `location.lng` | Number | Yes | — | No | Longitude |

**Invariants:**
- `pickupId` is unique.

### SystemState

| Field | Type | Required | Default | Indexed | Description |
|---|---|---|---|---|---|
| `configId` | String | Yes | `'global_optiroute_state'` | Yes (unique) | Singleton identifier |
| `firstDeliveries` | ObjectId[] | No | [] | No | First active delivery of each agent |
| `pickupPoints` | [{ lat, lng }] | No | [] | No | Global pickup coordinates |

**Invariants:**
- Singleton document pattern — exactly one document with `configId = 'global_optiroute_state'`.
- Updated via upsert from `deliveryService.syncGlobalFirstDeliveries()`.

---

## 8.3 Relationship Map

| From | To | Cardinality | Mechanism | Integrity |
|---|---|---|---|---|
| Agent → DeliveryAssignment | One-to-Many | ObjectId arrays (`activeDeliveries`, `pendingPickupDeliveries`) | Application-enforced |
| DeliveryAssignment → Agent | Many-to-One | `agentId` string field | Application-enforced |
| DeliveryAssignment → DeliveryAssignment | Self-referencing doubly-linked list | `prevDeliveryId`, `nextDeliveryId` ObjectId refs | Derived (rebuilt from arrays) |
| Agent ↔ AgentLocation | One-to-One | `agentId` string matching | No referential integrity |
| SystemState → DeliveryAssignment | One-to-Many | `firstDeliveries` ObjectId array | Application-enforced |

**Note:** No Mongoose `ref` population is used anywhere. All joins are manual lookups.

---

## 8.4 Data Lifecycle

| Event | Agent | DeliveryAssignment | AgentLocation | SystemState |
|---|---|---|---|---|
| **Created** | POST `/api/agents/add` | POST `/api/deliveries/add` | POST `/api/agents/location` (upsert) | Auto on first sync |
| **Updated** | On assign, pickup, complete, cancel | On assign (agentId), pointer sync | On each location report | On every delivery lifecycle event |
| **Deleted** | Never (no endpoint) | On completion or cancellation | Never (no endpoint) | Never |

### Orphan Prevention

| Scenario | Mechanism |
|---|---|
| Delivery deleted while assigned | `stateService.deleteDelivery` throws if `agentId` is non-null |
| Agent deleted with deliveries | No agent delete endpoint exists — prevented by omission |
| Pointer inconsistency | `_syncPointersFromArray` rebuilds all pointers from authoritative array on every mutation |

### Consistency Guarantees

| Guarantee | Mechanism | Scope |
|---|---|---|
| Agent queue ↔ delivery ownership | MongoDB transactions via `withSession` | Within single service call |
| Pointer ↔ array consistency | Pointers rebuilt on every array mutation | Eventual (derived) |
| SystemState ↔ agent state | `syncGlobalFirstDeliveries` called after lifecycle changes | Eventual (no transaction) |
| Cache ↔ reality | TTL-based expiry; no invalidation on data change | Best-effort |

### Stale State Risks

| Condition | Impact | Mitigation |
|---|---|---|
| SystemState not synced after crash mid-transaction | `firstDeliveries` may reference deleted deliveries | None — requires manual reconciliation |
| AgentLocation not updated (mobile offline) | Backend has stale GPS position | None — no staleness detection |
| Cache TTL not expired but road conditions changed | Cost estimates use outdated travel times | TTL eviction (default 60 min) |
| Pointer fields out of sync with arrays | Linked-list traversal returns incorrect order | Pointers are always rebuilt; reading arrays is authoritative |

### Retention Behavior

| Entity | Retention | Cleanup |
|---|---|---|
| Agent | Permanent (no delete) | None |
| AgentLocation | Permanent (no delete) | None |
| DeliveryAssignment | Deleted on completion/cancellation | deliveryService removes document |
| PickupLocation | Deleted on explicit delete request | stateService removes document |
| SystemState | Permanent singleton | Updated in-place |

---

