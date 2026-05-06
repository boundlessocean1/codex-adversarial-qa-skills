#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const target = process.env.CODEX_SKILLS_DIR || path.join(os.homedir(), '.agents', 'skills');
const skills = ['codex-ui-adversarial-playwright', 'codex-miniprogram-adversarial-skill'];

function exists(p) { return fs.existsSync(p); }
function ok(msg) { console.log(`✅ ${msg}`); }
function warn(msg) { console.log(`⚠️  ${msg}`); }
function fail(msg) { console.log(`❌ ${msg}`); }
function commandVersion(cmd, args) {
  const r = cp.spawnSync(cmd, args, { encoding: 'utf8', shell: process.platform === 'win32' });
  return r.status === 0 ? (r.stdout || r.stderr).trim() : null;
}

let failures = 0;
console.log('Codex Adversarial QA Skills doctor\n');

const major = Number(process.versions.node.split('.')[0]);
if (major >= 18) ok(`Node.js ${process.version}`); else { fail(`Node.js 18+ required, found ${process.version}`); failures += 1; }

const npmVersion = commandVersion(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version']);
if (npmVersion) ok(`npm ${npmVersion}`); else { fail('npm not found'); failures += 1; }

console.log(`\nSkills target: ${target}`);
for (const name of skills) {
  const dir = path.join(target, name);
  if (!exists(dir)) { fail(`${name} not installed`); failures += 1; continue; }
  ok(`${name} installed`);
  if (exists(path.join(dir, 'SKILL.md'))) ok(`${name}/SKILL.md found`); else { fail(`${name}/SKILL.md missing`); failures += 1; }
  if (exists(path.join(dir, 'node_modules'))) ok(`${name}/node_modules found`); else warn(`${name}/node_modules missing; run npm run install:skills`);
}

const macCli = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
if (process.platform === 'darwin') {
  if (exists(macCli)) ok(`WeChat Developer Tools CLI found: ${macCli}`);
  else warn(`WeChat Developer Tools CLI not found at ${macCli}. Mini Program skill can still work if you pass --cli-path or set WECHAT_DEVTOOLS_CLI.`);
}

console.log(failures ? `\nDoctor finished with ${failures} failure(s).` : '\nDoctor finished successfully.');
process.exit(failures ? 1 : 0);
