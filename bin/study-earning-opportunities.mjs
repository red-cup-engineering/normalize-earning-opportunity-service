#!/usr/bin/env node
/**
 * Run a financial opportunity change study on saved, separately captured
 * source observations. Nothing is fetched, purchased, recommended or booked.
 * Usage: study-earning-opportunities <observations.json> [--out <study.json>]
 * The input JSON must provide { observations, asOf, maxAgeMs? }.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { studyEarningOpportunityChanges } from '../src/changes.mjs';

export function run(args) {
  const { values, positionals } = parseArgs({
    args, allowPositionals: true, strict: true,
    options: { out: { type: 'string' } },
  });
  if (positionals.length !== 1) {
    throw new TypeError('usage: study-earning-opportunities <observations.json> [--out <study.json>]');
  }
  const inputFile = resolve(positionals[0]);
  const request = JSON.parse(readFileSync(inputFile, 'utf8'));
  const study = studyEarningOpportunityChanges(request);
  const content = JSON.stringify(study, null, 2) + '\n';
  // Deliberately do not overwrite an earlier research/receiving artifact.
  if (values.out) writeFileSync(resolve(values.out), content, { flag: 'wx' });
  return content;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(run(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write('earning-opportunity-study: ' + error.message + '\n');
    process.exitCode = 1;
  }
}
