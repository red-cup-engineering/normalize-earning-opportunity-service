export interface NormalizedEarningOpportunity {
  readonly type: "NormalizedEarningOpportunity";
  readonly id: string;
  readonly chain: string;
  readonly account: string;
  readonly provider: string;
  readonly mechanism: string;
  readonly underlyings: readonly string[];
  readonly apy: Readonly<{ availability: "observed" | "estimated" | "unavailable"; value: string | null; unit: "fraction-per-year"; denomination: string; method: string; reason?: string }>;
  readonly liquidity: Readonly<{ kind: string; capacity: Readonly<Record<string, unknown>>; accountAvailable: Readonly<Record<string, unknown>> }>;
  readonly changedRisks: readonly string[];
  readonly exit: Readonly<{ operation: string; receives: readonly string[]; constraints: readonly string[] }>;
  readonly freshness: Readonly<{ observedAt: string; chainBoundary: Readonly<Record<string, unknown>>; provenance: readonly Readonly<Record<string, unknown>>[] }>;
}

export function normalizeEarningOpportunity(candidate: unknown): NormalizedEarningOpportunity;
