import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const bin = fileURLToPath(new URL('../bin/study-earning-opportunities.mjs',import.meta.url));
const example = at => ({
 id:'slot-1',chain:'hive-engine',account:'principal-1',provider:'hive',mechanism:'fee',
 underlyings:['HIVE'],apy:{availability:'unavailable',value:null,
 denomination:'HIVE pool shares',method:'none',reason:'missing time series'},
 liquidity:{kind:'pool',capacity:{HIVE:'100'},accountAvailable:{HIVE:'10'}},
 changedRisks:['loss'],exit:{operation:'withdraw',receives:['HIVE'],constraints:['fee']},
 freshness:{observedAt:at,chainBoundary:{blockNumber:100},provenance:[{url:'https://example.com'}]},
});
test('CLI completes JSON study and refuses overwrite instead of fabricating second result',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'finance-study-'));
 try {
  const input=join(dir,'observations.json'),out=join(dir,'result.json');
  await writeFile(input,JSON.stringify({asOf:'2026-10-16T12:00:10.000Z',
    observations:[example('2026-10-16T12:00:00.000Z')]}));
  const stdout=execFileSync(process.execPath,[bin,input,'--out',out],{encoding:'utf8'});
  const study=JSON.parse(stdout);
  assert.equal(study.readings.length,1);
  assert.equal(study.readings[0].rateChange.reason,'single-observation');
  assert.deepEqual(JSON.parse(await readFile(out,'utf8')),study);
  const second=spawnSync(process.execPath,[bin,input,'--out',out],{encoding:'utf8'});
  assert.notEqual(second.status,0);
  assert.match(second.stderr,/EEXIST/u);
  assert.deepEqual(JSON.parse(await readFile(out,'utf8')),study);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('CLI refuses future market evidence without writing an output',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'finance-study-invalid-'));
 try {
  const input=join(dir,'obs.json'),out=join(dir,'study.json');
  await writeFile(input,JSON.stringify({asOf:'2026-10-15T12:00:00.000Z',
    observations:[example('2026-10-16T12:00:00.000Z')]}));
  const r=spawnSync(process.execPath,[bin,input,'--out',out],{encoding:'utf8'});
  assert.notEqual(r.status,0);
  assert.match(r.stderr,/future-dated/);
  await assert.rejects(readFile(out),{code:'ENOENT'});
 }finally{await rm(dir,{recursive:true,force:true});}
});
