import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEarningOpportunity, studyEarningOpportunityChanges } from '../src/index.mjs';

const A = '2026-10-15T18:00:00.000Z';
const B = '2026-10-16T18:00:00.000Z';
const NOW = '2026-10-16T18:00:15.000Z';
const source = (at, value, changes = {}) => ({
  id:'hive-pool-a',chain:'hive-engine',account:'principal-1',provider:'hive-engine',
  mechanism:'single-chain-pool-fee-estimate',underlyings:['ZING','SWAP.HIVE'],
  apy:{availability:'estimated',value,denomination:'ZING:SWAP.HIVE pool-share value',method:'observed 24h volume rate'},
  liquidity:{kind:'constant-product-pool',capacity:{ZING:'1000',details:{reserves:['1000','2000']}},accountAvailable:{ZING:'40'}},
  changedRisks:['liquidity','impermanent-loss'],
  exit:{operation:'removeLiquidity',receives:['ZING','SWAP.HIVE'],constraints:['fees']},
  freshness:{observedAt:at,chainBoundary:{blockNumber:at===A?101:102,inner:{hash:'a'.repeat(64)}},provenance:[{uri:'https://data.example/pool',evidence:{height:101}}]},
  ...changes,
});
function study(observations, changes={}) {
  return studyEarningOpportunityChanges({observations,asOf:NOW,maxAgeMs:120000,...changes});
}

test('existing consumer gets immutable detached capacity and provenance',()=>{
  const raw = source(A,'0.1');
  const normalized = normalizeEarningOpportunity(raw);
  raw.liquidity.capacity.details.reserves[0] = '999999';
  raw.freshness.provenance[0].evidence.height=888;
  raw.freshness.chainBoundary.inner.hash='evil';
  assert.deepEqual(normalized.liquidity.capacity.details.reserves,['1000','2000']);
  assert.equal(normalized.freshness.provenance[0].evidence.height,101);
  assert.equal(normalized.freshness.chainBoundary.inner.hash,'a'.repeat(64));
  assert.equal(Object.isFrozen(normalized.liquidity.capacity.details.reserves),true);
  assert.equal(Object.isFrozen(normalized.freshness.provenance[0].evidence),true);
  assert.throws(()=>{normalized.liquidity.capacity.details.reserves.push('42')},TypeError);
});

test('non-JSON and cyclic provenance are not covertly admitted',()=>{
  const bad = source(A,'0.1');
  bad.freshness.provenance[0].evidence.when = new Date(A);
  assert.throws(()=>normalizeEarningOpportunity(bad), /plain evidence record/);
  const cyclic = source(A,'0.1');
  cyclic.liquidity.capacity.details.parent = cyclic.liquidity.capacity;
  assert.throws(()=>normalizeEarningOpportunity(cyclic), /acyclic JSON/);
});

test('two separately sourced points produce exact decimal differences irrespective of order',()=>{
  const a=source(A,'0.100000000000000001'), b=source(B,'0.100000000000000002');
  const forward=study([a,b]);
  assert.deepEqual(study([b,a]),forward);
  assert.equal(forward.readings.length,1);
  assert.equal(forward.readings[0].rateChange.deltaFractionPerYear,'0.000000000000000001');
  assert.equal(forward.readings[0].rateChange.movement,'increased');
  assert.equal(forward.readings[0].rateChange.evidenceClass,'estimated');
  assert.equal(forward.readings[0].freshness,'current');
  assert.equal(forward.authorizedTrades,0);
  assert.equal(forward.realizedRevenue,null);
  assert.equal(forward.readings[0].capitalActionAuthorized,false);
});

test('negative delta exact and replayed same-clock snapshot counts once',()=>{
  const a=source(A,'0.125'),b=source(B,'0.12');
  const v=study([a,b,b,structuredClone(b)]);
  assert.equal(v.readings[0].sourceObservations,2);
  assert.equal(v.readings[0].rateChange.deltaFractionPerYear,'-0.005');
  assert.equal(v.readings[0].rateChange.movement,'decreased');
  assert.equal(study([a,a]).readings[0].rateChange.reason,'single-observation');
  assert.throws(()=>study([a,{...a,apy:{...a.apy,value:'0.2'}}]),/contradictory same-clock/);
});

test('unknown or estimated rates do not get promoted to an observed growth result',()=>{
  const a=source(A,null,{apy:{availability:'unavailable',value:null,denomination:'pool-share value',method:'no bounded series',reason:'no time-series'}});
  const b=source(B,'0.1',{apy:{availability:'estimated',value:'0.1',denomination:'pool-share value',method:'no bounded series'}});
  assert.equal(study([a,b]).readings[0].rateChange.reason,'unavailable-rate');
  const observed=source(B,'0.1',{apy:{availability:'observed',value:'0.1',denomination:'ZING:SWAP.HIVE pool-share value',method:'observed 24h volume rate'}});
  assert.equal(study([source(A,'0.09'),observed]).readings[0].rateChange.reason,'observed-versus-estimated');
});

test('principals, mechanisms and risk identities stay separate',()=>{
  assert.throws(()=>study([source(A,'0.1'),source(B,'0.2',{account:'other-person'})]),/crosses principal/);
  assert.equal(study([source(A,'0.1'),source(B,'0.2',{changedRisks:['rug']})]).readings[0].rateChange.reason,'risk-set-changed');
  assert.equal(study([source(A,'0.1'),source(B,'0.2',{apy:{availability:'estimated',value:'0.2',denomination:'USD',method:'observed 24h volume rate'}})]).readings[0].rateChange.reason,'denomination-changed');
});

test('replayed source boundary is not a new financial rate observation',()=>{
  const first=source(A,'0.1'),replay=source(B,'0.25',{freshness:{...first.freshness,observedAt:B}});
  const r=study([first,replay]);
  assert.equal(r.readings[0].rateChange.reason,'replayed-chain-boundary');
  assert.equal(r.readings[0].rateChange.deltaFractionPerYear,null);
});

test('missing source boundaries cannot manufacture independent rate change',()=>{
  const a=source(A,'0.1',{freshness:{observedAt:A,chainBoundary:{},provenance:[{}]}});
  const b=source(B,'0.2',{freshness:{observedAt:B,chainBoundary:{},provenance:[{}]}});
  assert.equal(study([a,b]).readings[0].rateChange.reason,'missing-source-boundary');
});

test('future and stale evidence are never folded into fresh actionable rates',()=>{
  assert.throws(()=>study([source('2026-10-17T00:00:00.000Z','0.1')]),/future-dated/);
  assert.equal(study([source(A,'0.1')]).readings[0].freshness,'stale');
  for(const maxAgeMs of [0,-1,1.5,Number.NaN,Infinity,31536000001])
    assert.throws(()=>study([source(A,'0.1')],{maxAgeMs}),/positive bounded/);
});
