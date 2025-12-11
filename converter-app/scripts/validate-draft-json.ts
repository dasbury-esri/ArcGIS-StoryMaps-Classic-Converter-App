#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import Ajv, { ErrorObject } from 'ajv';

function usageAndExit() {
  console.error('Usage: tsx converter-app/scripts/validate-draft-json.ts <path-to-json>');
  process.exit(2);
}

const arg = process.argv[2];
if (!arg) usageAndExit();

const workspaceRoot = process.cwd();
const jsonPath = path.isAbsolute(arg) ? arg : path.join(workspaceRoot, arg);
if (!fs.existsSync(jsonPath)) {
  console.error(`File not found: ${jsonPath}`);
  process.exit(2);
}

const schemaPath = path.join(workspaceRoot, 'schemas', 'draft-story.json');
if (!fs.existsSync(schemaPath)) {
  console.error(`Schema not found: ${schemaPath}`);
  process.exit(2);
}

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(schema);
const valid = validate(data);

function formatError(e: ErrorObject): string {
  const path = e.instancePath || e.schemaPath || '';
  const msg = e.message || 'schema error';
  const params = e.params ? JSON.stringify(e.params) : '';
  return `- at ${path}: ${msg} ${params}`;
}

if (!valid) {
  console.error(`Schema validation FAILED for: ${path.basename(jsonPath)}`);
  for (const e of validate.errors ?? []) {
    console.error(formatError(e));
  }
  process.exit(1);
} else {
  console.log(`OK: ${path.basename(jsonPath)} matches draft-story schema.`);
}
