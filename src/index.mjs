/** Normalize a read-only earning candidate without turning it into an action proposal. */

const NON_EMPTY = /\S/u;

function text(path, value) {
  if (typeof value !== "string" || !NON_EMPTY.test(value)) {
    throw new TypeError(`opportunity: ${path} must be a non-empty string`);
  }
  return value.trim();
}

function decimal(path, value, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value)) {
    throw new TypeError(`opportunity: ${path} must be a non-negative decimal string`);
  }
  return value;
}

function stringList(path, value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new RangeError(`opportunity: ${path} must be a non-empty array`);
  }
  return Object.freeze(value.map((entry, index) => text(`${path}[${index}]`, entry)));
}

function record(path, value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`opportunity: ${path} must be an object`);
  }
  return value;
}

/**
 * Preserve comparable economics, capacity, changed risks, exit, and freshness
 * for a candidate discovered by a chain-specific observer.
 */
export function normalizeEarningOpportunity(candidate) {
  const value = record("candidate", candidate);
  const apy = record("candidate.apy", value.apy);
  const availability = text("candidate.apy.availability", apy.availability);
  if (!new Set(["observed", "estimated", "unavailable"]).has(availability)) {
    throw new RangeError("opportunity: candidate.apy.availability is unsupported");
  }
  const apyValue = decimal("candidate.apy.value", apy.value, { nullable: true });
  if ((availability === "unavailable") !== (apyValue === null)) {
    throw new RangeError("opportunity: unavailable APY must be null and available APY must be numeric");
  }

  const liquidity = record("candidate.liquidity", value.liquidity);
  const exit = record("candidate.exit", value.exit);
  const freshness = record("candidate.freshness", value.freshness);
  const observedAt = new Date(freshness.observedAt);
  if (!Number.isFinite(observedAt.getTime()) || observedAt.toISOString() !== freshness.observedAt) {
    throw new TypeError("opportunity: candidate.freshness.observedAt must be a canonical ISO instant");
  }
  if (!Array.isArray(freshness.provenance) || freshness.provenance.length === 0) {
    throw new RangeError("opportunity: candidate.freshness.provenance must not be empty");
  }

  return Object.freeze({
    type: "NormalizedEarningOpportunity",
    id: text("candidate.id", value.id),
    chain: text("candidate.chain", value.chain),
    account: text("candidate.account", value.account),
    provider: text("candidate.provider", value.provider),
    mechanism: text("candidate.mechanism", value.mechanism),
    underlyings: stringList("candidate.underlyings", value.underlyings),
    apy: Object.freeze({
      availability,
      value: apyValue,
      unit: "fraction-per-year",
      denomination: text("candidate.apy.denomination", apy.denomination),
      method: text("candidate.apy.method", apy.method),
      ...(apy.reason === undefined ? {} : { reason: text("candidate.apy.reason", apy.reason) }),
    }),
    liquidity: Object.freeze({
      kind: text("candidate.liquidity.kind", liquidity.kind),
      capacity: Object.freeze(record("candidate.liquidity.capacity", liquidity.capacity)),
      accountAvailable: Object.freeze(record("candidate.liquidity.accountAvailable", liquidity.accountAvailable)),
    }),
    changedRisks: stringList("candidate.changedRisks", value.changedRisks),
    exit: Object.freeze({
      operation: text("candidate.exit.operation", exit.operation),
      receives: stringList("candidate.exit.receives", exit.receives),
      constraints: stringList("candidate.exit.constraints", exit.constraints),
    }),
    freshness: Object.freeze({
      observedAt: observedAt.toISOString(),
      chainBoundary: Object.freeze(record("candidate.freshness.chainBoundary", freshness.chainBoundary)),
      provenance: Object.freeze(freshness.provenance.map((entry, index) =>
        Object.freeze(record(`candidate.freshness.provenance[${index}]`, entry)))),
    }),
  });
}
