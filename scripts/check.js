#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const skillNames = ['codex-ui-adversarial-playwright', 'codex-miniprogram-adversarial-skill'];
const jsFiles = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk(p);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      jsFiles.push(p);
    }
  }
}

function checkSkill(skillDir) {
  const skillMd = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillMd)) throw new Error(`Missing ${skillMd}`);
  const text = fs.readFileSync(skillMd, 'utf8');
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) throw new Error(`Missing frontmatter: ${skillMd}`);
  if (!/^name:\s*.+/m.test(fm[1])) throw new Error(`Missing name: ${skillMd}`);
  if (!/^description:\s*.+/m.test(fm[1])) throw new Error(`Missing description: ${skillMd}`);
}

try {
  for (const name of skillNames) checkSkill(path.join(ROOT, 'skills', name));
  walk(path.join(ROOT, 'scripts'));
  walk(path.join(ROOT, 'skills'));
  for (const file of jsFiles) {
    const r = cp.spawnSync(process.execPath, ['--check', file], { stdio: 'pipe', encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`${file}\n${r.stderr || r.stdout}`);
  }
  console.log(`Checked ${skillNames.length} skills and ${jsFiles.length} JavaScript files.`);
} catch (err) {
  console.error(`[check] Failed: ${err.message}`);
  process.exit(1);
}
