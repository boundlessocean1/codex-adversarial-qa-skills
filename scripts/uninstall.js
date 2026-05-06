#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_TARGET = path.join(os.homedir(), '.agents', 'skills');
const SKILLS = ['codex-ui-adversarial-playwright', 'codex-miniprogram-adversarial-skill'];

function parseArgs(argv) {
  const args = { target: process.env.CODEX_SKILLS_DIR || DEFAULT_TARGET };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--target') args.target = path.resolve(argv[++i]);
    else if (arg.startsWith('--target=')) args.target = path.resolve(arg.slice('--target='.length));
    else if (arg === '-h' || arg === '--help') {
      console.log('Usage: node scripts/uninstall.js [--target ~/.agents/skills]');
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

try {
  const args = parseArgs(process.argv);
  for (const name of SKILLS) {
    const p = path.join(args.target, name);
    fs.rmSync(p, { recursive: true, force: true });
    console.log(`[uninstall] Removed ${p}`);
  }
  console.log('[uninstall] Done. Restart Codex if the skills still appear.');
} catch (err) {
  console.error(`[uninstall] Failed: ${err.message}`);
  process.exit(1);
}
