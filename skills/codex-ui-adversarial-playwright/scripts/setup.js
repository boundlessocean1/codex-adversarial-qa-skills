#!/usr/bin/env node
'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

function run(cmd, args, options = {}) {
  const result = childProcess.spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      npm_config_audit: 'false',
      npm_config_fund: 'false',
      npm_config_progress: 'false',
      npm_config_foreground_scripts: 'true',
      npm_config_package_lock: 'false',
    },
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed with exit code ${result.status}`);
  }
}

function main() {
  const root = path.resolve(__dirname, '..');
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 18) throw new Error(`Node.js 18+ is required. Current version: ${process.version}`);

  fs.rmSync(path.join(root, 'package-lock.json'), { force: true });

  console.log('[setup] Installing skill dependencies from public npm registry...');
  run('npm', [
    'install',
    '--no-package-lock',
    '--registry=https://registry.npmjs.org/',
    '--no-audit',
    '--fund=false',
    '--progress=false',
    '--loglevel=notice',
  ], { cwd: root });

  console.log('[setup] Installing Playwright Chromium for this skill...');
  run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['playwright', 'install', 'chromium'], { cwd: root });

  console.log('\n[setup] Done. Try:');
  console.log('  node scripts/run-audit.js --url http://localhost:3000');
}

try {
  main();
} catch (err) {
  console.error(`[setup] Failed: ${err.message}`);
  console.error('If npm reports EACCES in ~/.npm, run:');
  console.error('  sudo chown -R "$(id -u)":"$(id -g)" "$(npm config get cache)"');
  console.error('  npm cache clean --force');
  process.exit(1);
}
