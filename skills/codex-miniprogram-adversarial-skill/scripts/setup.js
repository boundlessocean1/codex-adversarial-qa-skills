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
  if (major < 18) {
    throw new Error(`Node.js 18+ is required. Current version: ${process.version}`);
  }

  const nodeModules = path.join(root, 'node_modules');
  const pkgLock = path.join(root, 'package-lock.json');

  // v0.1.0 was generated in a sandbox where package-lock.json could contain
  // non-public registry URLs. For portability, this skill installs directly
  // from package.json and ignores any existing lockfile in the skill folder.
  if (fs.existsSync(pkgLock)) {
    console.log('[setup] package-lock.json found; ignoring it for portable install.');
  }

  if (!fs.existsSync(nodeModules)) {
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
  } else {
    console.log('[setup] Dependencies already appear installed.');
  }

  console.log('\n[setup] Done. Next commands:');
  console.log('  node scripts/doctor.js --project /absolute/path/to/miniprogram');
  console.log('  node scripts/run-audit.js --project /absolute/path/to/miniprogram');
  console.log('\n[setup] If WeChat Developer Tools CLI is not detected, pass --cli-path or set WECHAT_DEVTOOLS_CLI.');
}

main();
