#!/usr/bin/env node
'use strict';

const path = require('path');
const {
  parseArgs,
  fileExists,
  defaultCliPath,
  resolveProjectPath,
  resolveMiniProgramRoot,
  readJsonSafe,
  discoverRoutes
} = require('../lib/helpers');

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    console.log('Usage: node scripts/doctor.js --project /path/to/miniprogram [--cli-path /path/to/cli]');
    return;
  }

  const checks = [];
  const add = (name, ok, detail = '') => checks.push({ name, ok, detail });

  const nodeMajor = Number(process.versions.node.split('.')[0]);
  add('Node.js >= 18', nodeMajor >= 18, process.version);

  let projectPath = '';
  try {
    projectPath = resolveProjectPath(args.project || args.projectPath || process.cwd());
    add('Project path exists', true, projectPath);
  } catch (error) {
    add('Project path exists', false, error.message);
  }

  if (projectPath) {
    const projectConfig = path.join(projectPath, 'project.config.json');
    add('project.config.json exists', fileExists(projectConfig), projectConfig);
    const miniRoot = resolveMiniProgramRoot(projectPath);
    add('Mini Program root exists', fileExists(miniRoot), miniRoot);
    add('app.json exists', fileExists(path.join(miniRoot, 'app.json')), path.join(miniRoot, 'app.json'));
    const appJson = readJsonSafe(path.join(miniRoot, 'app.json'));
    add('app.json parseable', !!appJson, appJson ? 'ok' : 'missing or invalid JSON');
    const routes = discoverRoutes(projectPath, args.routes || 'auto');
    add('Routes discovered', routes.length > 0, routes.map((r) => r.path).slice(0, 12).join(', '));
  }

  const cliPath = args.cliPath || process.env.WECHAT_DEVTOOLS_CLI || defaultCliPath();
  add('WeChat DevTools CLI exists', !!cliPath && fileExists(cliPath), cliPath || '(not detected)');

  let automatorOk = false;
  let automatorDetail = '';
  try {
    const pkg = require('miniprogram-automator/package.json');
    automatorOk = true;
    automatorDetail = `miniprogram-automator ${pkg.version}`;
  } catch (error) {
    automatorDetail = 'not installed; run npm run setup in this skill directory';
  }
  add('miniprogram-automator installed', automatorOk, automatorDetail);

  console.log('\nCodex Mini Program Skill Doctor\n');
  for (const check of checks) {
    console.log(`${check.ok ? '✅' : '❌'} ${check.name}${check.detail ? ` — ${check.detail}` : ''}`);
  }

  const failed = checks.filter((check) => !check.ok);
  if (failed.length) {
    console.log('\nFix the failed checks above before running the audit.');
    process.exitCode = 1;
  } else {
    console.log('\nAll basic checks passed.');
  }
}

main();
