#!/usr/bin/env node
'use strict';

/**
 * Universal Playwright executor for Codex UI testing.
 *
 * Usage:
 *   node run.js /tmp/script.js
 *   node run.js "await page.goto('https://example.com'); console.log(await page.title())"
 *   cat script.js | node run.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SKILL_DIR = __dirname;
process.chdir(SKILL_DIR);

function ensurePlaywright() {
  try {
    require.resolve('playwright', { paths: [SKILL_DIR] });
    return;
  } catch (_) {
    console.log('Playwright dependencies are missing. Running npm install...');
  }

  const install = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install'], {
    cwd: SKILL_DIR,
    stdio: 'inherit',
  });
  if (install.status !== 0) process.exit(install.status || 1);

  const browserInstall = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['playwright', 'install', 'chromium'], {
    cwd: SKILL_DIR,
    stdio: 'inherit',
  });
  if (browserInstall.status !== 0) process.exit(browserInstall.status || 1);
}

function getCode() {
  const args = process.argv.slice(2);
  if (args.length > 0 && fs.existsSync(args[0])) {
    const filePath = path.resolve(args[0]);
    console.log(`Executing Playwright file: ${filePath}`);
    return fs.readFileSync(filePath, 'utf8');
  }

  if (args.length > 0) {
    console.log('Executing inline Playwright code.');
    return args.join(' ');
  }

  if (!process.stdin.isTTY) {
    console.log('Executing Playwright code from stdin.');
    return fs.readFileSync(0, 'utf8');
  }

  console.error('No code provided. Pass a script file, inline code, or stdin.');
  process.exit(1);
}

function wrapIfNeeded(code) {
  const hasRequire = /require\s*\(/.test(code) || /import\s+/.test(code);
  const hasAsyncWrapper = /\(\s*async\s*\(\s*\)\s*=>/.test(code) || /async\s+function\s+main/.test(code);
  if (hasRequire && hasAsyncWrapper) return code;

  return `
'use strict';
const { chromium, firefox, webkit, devices, expect } = require('playwright');
const helpers = require('./lib/helpers');
const adversarial = require('./lib/adversarial');
const { resolveHeadless, getExtraHeadersFromEnv } = helpers;

function contextOptions(options = {}) {
  const headers = getExtraHeadersFromEnv();
  return headers ? { ...options, extraHTTPHeaders: { ...headers, ...(options.extraHTTPHeaders || {}) } } : options;
}

(async () => {
  try {
${indent(code, 4)}
  } catch (error) {
    console.error('Automation error:', error.message);
    if (error.stack) console.error(error.stack);
    process.exitCode = 1;
  }
})();
`;
}

function indent(text, spaces) {
  const pad = ' '.repeat(spaces);
  return text.split('\n').map((line) => (line.trim() ? pad + line : line)).join('\n');
}

function cleanupOldTempFiles() {
  for (const file of fs.readdirSync(os.tmpdir())) {
    if (!file.startsWith('codex-ui-exec-') || !file.endsWith('.js')) continue;
    const filePath = path.join(os.tmpdir(), file);
    try {
      const stat = fs.statSync(filePath);
      if (Date.now() - stat.mtimeMs > 24 * 60 * 60 * 1000) fs.unlinkSync(filePath);
    } catch (_) {
      // Ignore cleanup races.
    }
  }
}

function main() {
  cleanupOldTempFiles();
  ensurePlaywright();

  const code = wrapIfNeeded(getCode());
  const tempFile = path.join(os.tmpdir(), `codex-ui-exec-${Date.now()}.js`);
  fs.writeFileSync(tempFile, code, 'utf8');

  console.log(`Temporary execution file: ${tempFile}`);
  require(tempFile);
}

main();
