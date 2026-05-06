#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_TARGET = path.join(os.homedir(), '.agents', 'skills');
const SKILLS = [
  {
    dir: 'codex-ui-adversarial-playwright',
    display: 'Codex UI Adversarial Playwright',
    needsNpmInstall: true,
    needsPlaywrightChromium: true,
  },
  {
    dir: 'codex-miniprogram-adversarial-skill',
    display: 'Codex Mini Program Adversarial Skill',
    needsNpmInstall: true,
    needsPlaywrightChromium: false,
  },
];

function parseArgs(argv) {
  const args = {
    target: process.env.CODEX_SKILLS_DIR || DEFAULT_TARGET,
    registry: process.env.NPM_REGISTRY || 'https://registry.npmjs.org/',
    skipDeps: false,
    skipBrowsers: false,
    force: true,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--target') args.target = path.resolve(argv[++i]);
    else if (arg.startsWith('--target=')) args.target = path.resolve(arg.slice('--target='.length));
    else if (arg === '--registry') args.registry = argv[++i];
    else if (arg.startsWith('--registry=')) args.registry = arg.slice('--registry='.length);
    else if (arg === '--skip-deps') args.skipDeps = true;
    else if (arg === '--skip-browsers') args.skipBrowsers = true;
    else if (arg === '--no-force') args.force = false;
    else if (arg === '-h' || arg === '--help') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function printHelp() {
  console.log(`Install Codex Adversarial QA Skills\n\nUsage:\n  node scripts/install.js [options]\n\nOptions:\n  --target <dir>       Codex skills directory. Default: ~/.agents/skills\n  --registry <url>     npm registry. Default: https://registry.npmjs.org/\n  --skip-deps          Copy skills only; do not run npm install.\n  --skip-browsers      Do not install Playwright Chromium for the Web skill.\n  --no-force           Do not overwrite existing installed skill directories.\n  -h, --help           Show help.\n\nEnvironment:\n  CODEX_SKILLS_DIR     Alternative target directory.\n  NPM_REGISTRY         Alternative npm registry, e.g. https://registry.npmmirror.com\n`);
}

function run(cmd, args, opts = {}) {
  console.log(`\n> ${cmd} ${args.join(' ')}`);
  const result = cp.spawnSync(cmd, args, {
    cwd: opts.cwd || ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      npm_config_audit: 'false',
      npm_config_fund: 'false',
      npm_config_progress: 'false',
      npm_config_foreground_scripts: 'true',
      npm_config_package_lock: 'false',
      ...(opts.env || {}),
    },
  });

  if (result.status !== 0) {
    const hint = cmd.includes('npm')
      ? `\n\nIf npm reports EACCES in ~/.npm, run:\n  sudo chown -R "$(id -u)":"$(id -g)" "$(npm config get cache)"\n  npm cache clean --force\nThen retry the install.\n`
      : '';
    throw new Error(`${cmd} ${args.join(' ')} failed with exit code ${result.status}.${hint}`);
  }
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) throw new Error(`Missing source directory: ${src}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, {
    recursive: true,
    filter: (p) => !p.includes(`${path.sep}node_modules${path.sep}`) && !p.endsWith(`${path.sep}package-lock.json`),
  });
}

function validateSkill(dest) {
  const skillMd = path.join(dest, 'SKILL.md');
  if (!fs.existsSync(skillMd)) throw new Error(`Missing SKILL.md in ${dest}`);
  const text = fs.readFileSync(skillMd, 'utf8');
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) throw new Error(`Missing YAML frontmatter in ${skillMd}`);
  if (!/^name:\s*.+$/m.test(fm[1])) throw new Error(`Missing name in ${skillMd}`);
  if (!/^description:\s*.+/m.test(fm[1])) throw new Error(`Missing description in ${skillMd}`);
}

function installSkillDeps(skillDir, registry, installBrowser) {
  const pkg = path.join(skillDir, 'package.json');
  if (!fs.existsSync(pkg)) return;

  fs.rmSync(path.join(skillDir, 'package-lock.json'), { force: true });

  run('npm', [
    'install',
    '--no-package-lock',
    `--registry=${registry}`,
    '--no-audit',
    '--fund=false',
    '--progress=false',
    '--loglevel=notice',
  ], { cwd: skillDir });

  if (installBrowser) {
    run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['playwright', 'install', 'chromium'], { cwd: skillDir });
  }
}

function main() {
  const args = parseArgs(process.argv);
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 18) throw new Error(`Node.js 18+ is required. Current version: ${process.version}`);

  const sourceRoot = path.join(ROOT, 'skills');
  if (!fs.existsSync(sourceRoot)) throw new Error(`Missing skills directory: ${sourceRoot}`);

  fs.mkdirSync(args.target, { recursive: true });
  console.log(`[install] Target: ${args.target}`);

  for (const skill of SKILLS) {
    const src = path.join(sourceRoot, skill.dir);
    const dest = path.join(args.target, skill.dir);

    if (fs.existsSync(dest) && !args.force) {
      throw new Error(`Skill already exists: ${dest}. Remove it or omit --no-force.`);
    }

    console.log(`\n[install] Installing ${skill.display}...`);
    copyDir(src, dest);
    validateSkill(dest);

    if (!args.skipDeps && skill.needsNpmInstall) {
      installSkillDeps(dest, args.registry, skill.needsPlaywrightChromium && !args.skipBrowsers);
    }
  }

  console.log('\n[install] Done. Restart Codex if the skills do not appear immediately.');
  console.log('\nTry:');
  console.log('  $codex-ui-adversarial-playwright 测试 http://localhost:3000，只总结 Top 10 问题并保存报告');
  console.log('  $codex-miniprogram-adversarial-skill 测试 /absolute/path/to/miniprogram，输出报告');
  console.log('\nVerify:');
  console.log('  node scripts/doctor.js');
}

try {
  main();
} catch (err) {
  console.error(`\n[install] Failed: ${err.message}`);
  process.exit(1);
}
