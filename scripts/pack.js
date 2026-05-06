#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const outDir = path.join(ROOT, 'dist');
const out = path.join(outDir, 'codex-adversarial-qa-skills.zip');
fs.mkdirSync(outDir, { recursive: true });
fs.rmSync(out, { force: true });
const r = cp.spawnSync('zip', [
  '-r', out,
  '.',
  '-x', 'dist/*', '*/node_modules/*', '*/package-lock.json', '.git/*', '*.DS_Store'
], { cwd: ROOT, stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status || 1);
console.log(`Packed: ${out}`);
