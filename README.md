# Earning Opportunity Normalization and Change Studies

**Owner:** Red Cup Financial Engineering. Pure, read-only transformation for
account- and source-bound economic research, consumed through Treasury
Observation's existing `./opportunities` re-export. The service neither
opens accounts nor places trades, reports realized returns or writes books.

## Make an opportunity change study

The engineering observer produces `NormalizedEarningOpportunity` records.
Keep independently sampled records rather than substituting fresh timestamps
on old block data. Save a study request with:

```json
{
  "asOf": "2026-10-16T18:00:15.000Z",
  "maxAgeMs": 3600000,
  "observations": [
    {
      "id": "example-hive-pool",
      "chain": "hive-engine",
      "account": "example-principal",
      "provider": "hive-engine",
      "mechanism": "fee accrual model",
      "underlyings": ["ZING", "SWAP.HIVE"],
      "apy": {
        "availability": "unavailable",
        "value": null,
        "denomination": "ZING:SWAP.HIVE pool-share value",
        "method": "gross fees not measured over a time interval",
        "reason": "no bounded fee series"
      },
      "liquidity": {
        "kind": "constant-product-pool",
        "capacity": {},
        "accountAvailable": {}
      },
      "changedRisks": ["liquidity risk"],
      "exit": {
        "operation": "removeLiquidity",
        "receives": ["ZING", "SWAP.HIVE"],
        "constraints": ["venue fees"]
      },
      "freshness": {
        "observedAt": "2026-10-16T18:00:00.000Z",
        "chainBoundary": {"blockNumber": 12345},
        "provenance": [{"source": "illustrative only"}]
      }
    }
  ]
}
```

This is an illustrative shape, **not evidence of a real Hive block, position,
trading return, or commercially accessible opportunity**. Unobserved rates
remain `null`. No chain or HTTP calls are made by the study.

```sh
npm test
npm run study:earning -- path/to/observations.json --out path/to/study.json
```

The package also exposes the `study-earning-opportunities` executable and
`studyEarningOpportunityChanges` from its root and `./changes` entry points.
`--out` creates a new file only; old research files are not overwritten.

## Comparison contract

- A candidate's unique id **cannot change chain, beneficial account, provider
  or mechanism** without a refusal. Different accounts never become a pooled
  opportunity or Union treasury.
- Comparisons require a current and prior dated snapshot, nonempty **distinct
  chain boundaries**, equal underlying assets, risk sets, exit terms, liquidity
  kind, denomination, rate method and observation class.
- Estimated APY differences are labeled **estimated**; observed APY differences
  are labeled **observed**. Neither is an observed trading return or net yield.
  Unavailable rates, mixed estimate/observation, stale or replayed source
  snapshots never quietly become current profitable opportunities.
- Annualized rate *differences* are represented as signed **exact decimal
  strings**, not floating point or a cash amount. There is no FX conversion,
  rate aggregation across unlike principal/currency/risk units, capital
  allocation or financial authorization.
- Evidence including nested source boundary and capacity records is detached
  and frozen; a caller cannot mutate the historical observation through an
  alias after it is accepted.

Research can be useful with zero available capital; movement of capital is
a separate contract under the owning principal's authority, bounded risk
sleeve, books and venue execution system. Subsequent published package and
installed Treasury consumer receiving are separate from merging source.
