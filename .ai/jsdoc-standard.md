
# Required JSDoc Documentation Structure

All generated or modified code MUST follow the below JSDoc conventions consistently.

The goal is:

* architectural clarity
* explicit ownership boundaries
* LLM readability
* maintainability
* strong IDE inference
* transactional reasoning visibility

---

## 1. File-Level Documentation

Every file MUST begin with:

```js
/**
 * @fileoverview
 * <Service/File Name>
 *
 * Responsibilities:
 * - ...
 * - ...
 *
 * Non-responsibilities:
 * - ...
 * - ...
 *
 * Architectural Role:
 * - ...
 *
 * Transaction Ownership:
 * - Owns transactions
 * - Does not own transactions
 * - Reuses external sessions only
 *
 * Pointer Ownership:
 * - Owns pointer synchronization
 * - Does not mutate pointers
 *
 * Queue Ownership:
 * - ...
 *
 * Routing Ownership:
 * - ...
 */
```

---

## 2. Type Definitions

Reusable structures MUST use @typedef.

Example:

```js
/**
 * Canonical normalized stop representation.
 *
 * @typedef {Object} NormalizedStop
 *
 * @property {string} id
 * Stable stop identifier.
 *
 * @property {number} lat
 * Latitude coordinate.
 *
 * @property {number} lng
 * Longitude coordinate.
 *
 * @property {Object} raw
 * Original unmodified source object.
 */
```

---

## 3. Enum Definitions

```js
/**
 * Supported routing strategies.
 *
 * @enum {string}
 */
const RoutingStrategies = {
  INSERTION: 'insertion',
  TWO_OPT: 'two-opt'
};
```

---

## 4. Callback Definitions

```js
/**
 * Route evaluation callback.
 *
 * @callback RouteEvaluator
 *
 * @param {Object[]} route
 * @param {Object} matrix
 *
 * @returns {number}
 * Computed route score.
 */
```

---

## 5. Function Documentation Structure

ALL exported and important internal functions MUST follow this structure.

```js
/**
 * Short single-line summary.
 *
 * Detailed Description:
 * Explain the deeper architectural purpose of the function.
 *
 * PROCESS:
 * 1. Step one
 * 2. Step two
 * 3. Step three
 *
 * SYSTEM EFFECTS:
 * - Database mutations
 * - Cache updates
 * - Pointer synchronization
 * - Queue mutations
 * - None
 *
 * INVARIANTS PRESERVED:
 * - Pointer consistency
 * - Ownership exclusivity
 * - Transactional integrity
 * - Route validity
 *
 * TRANSACTION:
 * - Owns transaction
 * - Reuses provided session
 * - Read-only
 *
 * @async
 *
 * @param {string} agentId
 * External agent identifier.
 *
 * @param {Object[]} route
 * Ordered route collection.
 *
 * @param {SessionOptions} [options={}]
 * Optional transactional configuration.
 *
 * @returns {Promise<RouteEvaluation>}
 * Evaluated route result.
 *
 * @throws {Error}
 * General operation failure.
 *
 * @exception {Error}
 * Agent not found.
 *
 * @exception {Error}
 * Invalid route structure.
 *
 * @example
 * const result =
 *   await optimizeRoute(
 *     stops,
 *     options
 *   );
 */
```

---

## 6. Internal/Private Methods

Internal helpers MUST still be documented.

```js
/**
 * INTERNAL: Synchronizes pointer structure.
 *
 * @private
 *
 * PROCESS:
 * 1. Traverse ordered queue
 * 2. Update prev pointers
 * 3. Update next pointers
 *
 * SYSTEM EFFECTS:
 * - Mutates delivery pointer fields
 *
 * INVARIANTS PRESERVED:
 * - Bidirectional traversal consistency
 *
 * @async
 *
 * @param {string} agentId
 * @param {'active'|'pending'} queueType
 * @param {mongoose.ClientSession} session
 *
 * @returns {Promise<void>}
 */
```

---

## 7. Read-Only Methods

Read-only methods MUST explicitly state that they do not mutate state.

```js
/**
 * Retrieves delivery details.
 *
 * SYSTEM EFFECTS:
 * - None
 *
 * TRANSACTION:
 * - Read-only
 */
```

---

## 8. Primitive Mutation Methods

stateService primitives MUST explicitly define:

* mutation ownership
* queue ownership
* pointer ownership
* transaction behavior

Example:

```js
/**
 * Adds delivery to pending queue.
 *
 * SYSTEM EFFECTS:
 * - Updates agent.pendingPickupDeliveries
 * - Updates delivery.agentId
 * - Synchronizes queue pointers
 *
 * INVARIANTS PRESERVED:
 * - Single-agent ownership
 * - Pointer consistency
 * - Queue uniqueness
 *
 * TRANSACTION:
 * - Owns transaction if session absent
 * - Reuses provided transaction otherwise
 */
```

---

## 9. Orchestration Services

Lifecycle/orchestration services MUST explicitly define that they:

* orchestrate only
* do not directly mutate persistence
* delegate mutations to stateService

Example:

```js
/**
 * Processes pickup workflow.
 *
 * Architectural Notes:
 * - Orchestration layer only
 * - Does not directly mutate database
 * - Delegates queue mutation to stateService
 * - Delegates optimization to routingEngineService
 */
```

---

## 10. Strategy Files

Routing strategy files MUST define:

* algorithm category
* optimization characteristics
* mutation guarantees

Example:

```js
/**
 * Cheapest insertion routing strategy.
 *
 * Algorithm Characteristics:
 * - Greedy heuristic
 * - Incremental insertion
 * - Deterministic ordering
 *
 * Complexity:
 * - O(n²)
 *
 * Mutation Guarantees:
 * - Does not mutate input route
 */
```

---

## 11. Required Standards

The generated documentation MUST:

* avoid vague descriptions
* avoid generic comments
* describe architectural intent
* describe ownership boundaries
* describe invariants
* describe mutation behavior
* describe transaction behavior
* describe coupling expectations
* describe side effects explicitly

The generated documentation MUST NOT:

* omit SYSTEM EFFECTS
* omit INVARIANTS
* omit PROCESS
* omit transaction ownership
* omit architectural responsibility boundaries
* use placeholder comments
* use undocumented helpers
* leave exported methods undocumented

```
```
