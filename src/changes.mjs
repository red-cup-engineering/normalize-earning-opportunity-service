/**
 * Convert a sequence of normalized earning observations into a bounded,
 * source-preserving rate-change study. This is research, not portfolio
 * allocation: APY alone is not expected after-fee return or authority to
 * commit a principal's capital.
 *
 * We compare only observations of the SAME principal, venue mechanism, unit,
 * risks and rate method. An unknown or estimated APY never becomes an observed
 * return. Original chain-boundary evidence is retained, not silently replaced
 * by a caller's later wall-clock label.
 */
import { normalizeEarningOpportunity } from './index.mjs';

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function clock(value, name) {
  const t = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(t) || new Date(t).toISOString() !== value) {
    throw new TypeError(name + ' must be a canonical UTC ISO instant');
  }
  return t;
}

/** Exact APY delta without floating-point rounding; output is a signed
 * fraction-per-year decimal string, not a monetary amount or realized gain.
 */
function decimalDelta(after, before) {
  const decimals = Math.max((after.split('.')[1] ?? '').length, (before.split('.')[1] ?? '').length);
  const parse = str => {
    const [whole, fraction = ''] = str.split('.');
    return BigInt(whole) * 10n ** BigInt(decimals) + BigInt((fraction + '0'.repeat(decimals)).slice(0, decimals) || '0');
  };
  const diff = parse(after) - parse(before);
  if (diff === 0n) return '0';
  const negative = diff < 0n;
  const absolute = negative ? -diff : diff;
  const base = 10n ** BigInt(decimals);
  const whole = absolute / base;
  const frac = (absolute % base).toString().padStart(decimals, '0').replace(/0+$/u, '');
  return (negative ? '-' : '') + whole + (frac ? '.' + frac : '');
}

function comparable(a, b) {
  if (a.apy.availability === 'unavailable' || b.apy.availability === 'unavailable') {
    return 'unavailable-rate';
  }
  if (a.apy.availability !== b.apy.availability) return 'observed-versus-estimated';
  if (a.apy.denomination !== b.apy.denomination || a.apy.unit !== b.apy.unit) return 'denomination-changed';
  if (a.apy.method !== b.apy.method) return 'rate-method-changed';
  if (canonical(a.underlyings.slice().sort()) !== canonical(b.underlyings.slice().sort())) return 'underlyings-changed';
  if (canonical(a.changedRisks.slice().sort()) !== canonical(b.changedRisks.slice().sort())) return 'risk-set-changed';
  if (a.liquidity.kind !== b.liquidity.kind) return 'liquidity-kind-changed';
  if (canonical(a.exit) !== canonical(b.exit)) return 'exit-terms-changed';
  if (!Object.keys(a.freshness.chainBoundary).length || !Object.keys(b.freshness.chainBoundary).length) return 'missing-source-boundary';
  const sameBoundary = canonical(a.freshness.chainBoundary) === canonical(b.freshness.chainBoundary);
  if (sameBoundary && Object.keys(a.freshness.chainBoundary).length) return 'replayed-chain-boundary';
  return null;
}

/**
 * @param {{observations: object[], asOf: string, maxAgeMs?: number}} request
 * @returns {object} Read-only rate-change study: no trades, receipts, revenue or investment advice.
 */
export function studyEarningOpportunityChanges({ observations, asOf, maxAgeMs = 3600000 } = {}) {
  const asOfMs = clock(asOf, 'asOf');
  if (!Array.isArray(observations) || observations.length < 1 || observations.length > 2000) {
    throw new TypeError('observations must contain 1..2000 source observations');
  }
  if (!Number.isSafeInteger(maxAgeMs) || maxAgeMs < 1 || maxAgeMs > 31536000000) {
    throw new TypeError('maxAgeMs must be a positive bounded duration');
  }
  const byId = new Map();
  for (const candidate of observations) {
    const value = normalizeEarningOpportunity(candidate);
    const at = clock(value.freshness.observedAt, 'observation ' + value.id);
    if (at > asOfMs) throw new RangeError('observation ' + value.id + ' is future-dated');
    const series = byId.get(value.id) ?? [];
    const first = series[0]?.value;
    if (first && (first.chain !== value.chain || first.account !== value.account ||
        first.provider !== value.provider || first.mechanism !== value.mechanism)) {
      throw new TypeError('opportunity identity crosses principal/venue/mechanism: ' + value.id);
    }
    const existing = series.find(item => item.at === at);
    if (existing) {
      if (canonical(existing.value) !== canonical(value)) {
        throw new TypeError('contradictory same-clock opportunity evidence: ' + value.id);
      }
      continue;
    }
    series.push({ at, value });
    byId.set(value.id, series);
  }
  const readings = [];
  for (const [id, series] of [...byId].sort(([a], [b]) => a.localeCompare(b))) {
    series.sort((a, b) => a.at - b.at);
    const current = series.at(-1).value;
    const previous = series.length > 1 ? series.at(-2).value : null;
    const ageMs = asOfMs - series.at(-1).at;
    let reason = previous ? comparable(previous, current) : 'single-observation';
    const difference = reason === null ? decimalDelta(current.apy.value, previous.apy.value) : null;
    const movement = difference === null ? 'not-comparable' :
      difference === '0' ? 'unchanged' : difference.startsWith('-') ? 'decreased' : 'increased';
    const freshness = ageMs <= maxAgeMs ? 'current' : 'stale';
    readings.push(Object.freeze({
      id, principal: Object.freeze({chain: current.chain, account: current.account}),
      provider: current.provider, mechanism: current.mechanism,
      denomination: current.apy.denomination, latestRate: current.apy.value,
      latestRateStatus: current.apy.availability, previousRate: previous?.apy.value ?? null,
      latestObservedAt: current.freshness.observedAt,
      previousObservedAt: previous?.freshness.observedAt ?? null,
      sourceObservations: series.length, freshness, ageMs,
      rateChange: Object.freeze({movement, deltaFractionPerYear: difference,
        evidenceClass: difference === null ? null : current.apy.availability,
        reason: reason ?? null}),
      sourceBoundaries: Object.freeze({latest: current.freshness.chainBoundary,
        previous: previous?.freshness.chainBoundary ?? null}),
      provenance: Object.freeze({latest: current.freshness.provenance,
        previous: previous?.freshness.provenance ?? []}),
      // Rate observations do not prove after-fee surplus, viable size,
      // chain-level exit, legal authority, or a new account allocation.
      capitalActionAuthorized: false, afterCostYieldEstablished: false,
    }));
  }
  return Object.freeze({type:'EarningOpportunityChangeStudy',version:1,asOf,maxAgeMs,
    observationsReceived: observations.length, opportunitiesCompared: readings.length,
    readings: Object.freeze(readings), authorizedTrades: 0,
    realizedRevenue: null, downstreamAction: 'independent capital-and-cost research only'});
}
