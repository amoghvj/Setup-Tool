/**
 * @fileoverview
 * Cost Model Service
 *
 * Responsible for evaluating route quality.
 *
 * Responsibilities:
 * - Travel time evaluation
 * - Distance evaluation
 * - SLA penalty evaluation
 * - Load penalty evaluation
 * - Detour penalty evaluation
 * - Route scoring
 *
 * Non-responsibilities:
 * - Route generation
 * - Assignment logic
 * - Database mutation
 * - Delivery lifecycle management
 */

const {
    routingWeights,
    routingConfig
} = require('../config/routingConfig');

const {
    getCachedTravelMetrics,
    deriveHaversineMetrics,
    normalizeStop
} = require('./matrixCacheService');

/**
 * Retrieves a matrix entry using supported matrix formats.
 *
 * SUPPORTED MATRIX TYPES:
 * - Matrix-like object with .get()
 * - JavaScript Map
 * - Nested object structure
 *
 * @param {Object|Map} matrix
 * Travel matrix.
 *
 * @param {string} fromId
 * Source stop identifier.
 *
 * @param {string} toId
 * Destination stop identifier.
 *
 * @returns {Object|null}
 * Matrix entry if found.
 */
function getMatrixEntry(
    matrix,
    fromId,
    toId
) {
    if (!matrix) {
        return null;
    }

    if (typeof matrix.get === 'function') {
        return (
            matrix.get(fromId, toId) ||
            matrix.get(`${fromId}::${toId}`) ||
            null
        );
    }

    if (matrix instanceof Map) {
        return (
            matrix.get(`${fromId}::${toId}`) ||
            null
        );
    }

    return (
        matrix?.[fromId]?.[toId] ||
        null
    );
}

/**
 * Retrieves metrics for a route segment.
 *
 * PROCESS:
 * 1. Normalize stops.
 * 2. Attempt matrix lookup.
 * 3. Attempt cache lookup.
 * 4. Fall back to haversine approximation.
 *
 * SYSTEM EFFECTS:
 * - None
 *
 * @param {Object} fromStop
 * Route origin stop.
 *
 * @param {Object} toStop
 * Route destination stop.
 *
 * @param {Object} matrix
 * Precomputed travel matrix.
 *
 * @returns {{
 *   timeMinutes: number,
 *   distanceKm: number,
 *   source: string
 * }}
 *
 * Travel metrics.
 *
 * @example
 * const metrics = getLegMetrics(
 *   stopA,
 *   stopB,
 *   matrix
 * );
 */
function getLegMetrics(
    fromStop,
    toStop,
    matrix
) {
    const from = normalizeStop(fromStop);
    const to = normalizeStop(toStop);

    if (!from || !to) {
        return {
            timeMinutes: 0,
            distanceKm: 0,
            source: 'fallback'
        };
    }

    const matrixEntry = getMatrixEntry(
        matrix,
        from.id,
        to.id
    );

    if (matrixEntry) {
        return {
            timeMinutes:
                Number(matrixEntry.timeSeconds ?? 0) / 60,

            distanceKm:
                Number(matrixEntry.distanceKm ?? 0),

            source:
                matrixEntry.source || 'matrix'
        };
    }

    const cached = getCachedTravelMetrics(
        from,
        to
    );

    if (cached) {
        return {
            timeMinutes:
                Number(cached.timeSeconds ?? 0) / 60,

            distanceKm:
                Number(cached.distanceKm ?? 0),

            source:
                cached.source || 'cache'
        };
    }

    const fallback =
        deriveHaversineMetrics(
            from,
            to
        );

    return {
        timeMinutes:
            fallback.timeSeconds / 60,

        distanceKm:
            fallback.distanceKm,

        source:
            fallback.source
    };
}

/**
 * Computes SLA violation penalties for a route.
 *
 * PROCESS:
 * 1. Simulate route traversal.
 * 2. Accumulate elapsed time.
 * 3. Compare arrival time against SLA.
 * 4. Apply weighted penalty for violations.
 *
 * SYSTEM EFFECTS:
 * - None
 *
 * @param {Object[]} route
 * Ordered route stops.
 *
 * @param {Object} matrix
 * Precomputed travel matrix.
 *
 * @param {Object} [options={}]
 * Cost evaluation options.
 *
 * @param {number} [options.startTimeMinutes=0]
 * Initial elapsed time offset.
 *
 * @returns {number}
 * Total SLA penalty.
 *
 * @example
 * const penalty =
 *   computeLatePenalty(
 *     route,
 *     matrix
 *   );
 */
function computeLatePenalty(
    route,
    matrix,
    options = {}
) {
    let elapsedMinutes = Number(
        options.startTimeMinutes ?? 0
    );

    let penalty = 0;

    for (
        let index = 0;
        index < route.length - 1;
        index += 1
    ) {
        const leg = getLegMetrics(
            route[index],
            route[index + 1],
            matrix
        );

        elapsedMinutes += leg.timeMinutes;

        const stop = route[index + 1];

        const stopSla = Number(
            stop?.slaMinutes ??
            stop?.dueInMinutes ??
            NaN
        );

        if (
            Number.isFinite(stopSla) &&
            elapsedMinutes > stopSla
        ) {
            penalty +=
                (
                    elapsedMinutes - stopSla
                ) *
                routingConfig.slaPenaltyMultiplier;
        }

        elapsedMinutes += Number(
            stop?.serviceTimeMinutes ??
            stop?.serviceTime ??
            routingConfig.serviceTimeMinutes ??
            0
        );
    }

    return penalty;
}

/**
 * Computes overall route cost.
 *
 * COST FACTORS:
 * - Travel time
 * - Distance
 * - SLA violations
 * - Load penalties
 * - Detour penalties
 *
 * FORMULA:
 * alpha * travelTime
 * + beta * distance
 * + gamma * slaPenalty
 * + delta * loadPenalty
 * + epsilon * detourPenalty
 *
 * SYSTEM EFFECTS:
 * - None
 *
 * @param {Object[]} route
 * Ordered route.
 *
 * @param {Object} matrix
 * Precomputed travel matrix.
 *
 * @param {Object} [options={}]
 * Cost evaluation configuration.
 *
 * @param {number} [options.loadPenalty]
 * Override load penalty.
 *
 * @param {number} [options.detourPenalty=0]
 * Additional detour penalty.
 *
 * @returns {number}
 * Final route cost.
 *
 * @example
 * const cost = routeCost(
 *   route,
 *   matrix
 * );
 */
function routeCost(
    route,
    matrix,
    options = {}
) {
    if (
        !Array.isArray(route) ||
        route.length <= 1
    ) {
        return 0;
    }

    let travelMinutes = 0;
    let distanceKm = 0;

    for (
        let index = 0;
        index < route.length - 1;
        index += 1
    ) {
        const leg = getLegMetrics(
            route[index],
            route[index + 1],
            matrix
        );

        travelMinutes += leg.timeMinutes;
        distanceKm += leg.distanceKm;
    }

    const latePenalty =
        computeLatePenalty(
            route,
            matrix,
            options
        );

    const loadPenalty = Number(
        options.loadPenalty ??
        Math.max(0, route.length - 1)
    );

    const detourPenalty = Number(
        options.detourPenalty ?? 0
    );

    return (
        routingWeights.alpha * travelMinutes +
        routingWeights.beta * distanceKm +
        routingWeights.gamma * latePenalty +
        routingWeights.delta * loadPenalty +
        routingWeights.epsilon * detourPenalty
    );
}

module.exports = {
    routeCost,
    computeLatePenalty,
    getLegMetrics,
    getMatrixEntry
};