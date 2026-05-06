'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { PNG } = require('pngjs');

function parseArgs(argv) {
  const args = {};
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      rest.push(token);
      continue;
    }
    const eq = token.indexOf('=');
    let key;
    let value;
    if (eq > -1) {
      key = token.slice(2, eq);
      value = token.slice(eq + 1);
    } else {
      key = token.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        value = true;
      } else {
        value = next;
        i += 1;
      }
    }
    args[toCamelCase(key)] = value;
  }
  args._ = rest;
  return args;
}

function toCamelCase(value) {
  return String(value).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
}

function boolArg(value, defaultValue = false) {
  if (value === undefined) return defaultValue;
  if (value === true) return true;
  const text = String(value).toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(text)) return false;
  return defaultValue;
}

function intArg(value, defaultValue) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function floatArg(value, defaultValue) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return null;
  }
}

function fileExists(file) {
  try {
    return fs.existsSync(file);
  } catch (_) {
    return false;
  }
}

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function defaultCliPath() {
  if (process.platform === 'darwin') return '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
  if (process.platform === 'win32') return 'C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat';
  return '';
}

function resolveProjectPath(projectArg) {
  const projectPath = projectArg ? path.resolve(String(projectArg)) : process.cwd();
  if (!fileExists(projectPath)) {
    throw new Error(`Project path does not exist: ${projectPath}`);
  }
  return projectPath;
}

function resolveMiniProgramRoot(projectPath) {
  const configPath = path.join(projectPath, 'project.config.json');
  const config = readJsonSafe(configPath) || {};
  let miniRoot = config.miniprogramRoot || '';
  if (miniRoot && path.isAbsolute(miniRoot)) return miniRoot;
  if (miniRoot) return path.resolve(projectPath, miniRoot);
  return projectPath;
}

function normalizeRoute(route) {
  if (!route) return '';
  let value = String(route).trim();
  if (!value) return '';
  if (!value.startsWith('/')) value = `/${value}`;
  return value.replace(/\/+/g, '/');
}

function sanitizeName(input) {
  return String(input || 'route')
    .replace(/^\/+/, '')
    .replace(/[?#].*$/, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'route';
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function discoverRoutes(projectPath, explicitRoutes) {
  if (explicitRoutes && explicitRoutes !== 'auto' && explicitRoutes !== 'all') {
    return String(explicitRoutes)
      .split(',')
      .map((item) => normalizeRoute(item))
      .filter(Boolean)
      .map((routePath) => ({ path: routePath, isTab: false, source: 'cli' }));
  }

  const miniRoot = resolveMiniProgramRoot(projectPath);
  const appJsonPath = path.join(miniRoot, 'app.json');
  const appJson = readJsonSafe(appJsonPath);
  if (!appJson) {
    const fallback = normalizeRoute(process.env.MP_ROUTE || '/pages/index/index');
    return [{ path: fallback, isTab: false, source: 'fallback' }];
  }

  const tabPaths = new Set(
    (appJson.tabBar && Array.isArray(appJson.tabBar.list) ? appJson.tabBar.list : [])
      .map((item) => normalizeRoute(item.pagePath))
      .filter(Boolean)
  );

  const routes = [];
  for (const pagePath of appJson.pages || []) {
    const routePath = normalizeRoute(pagePath);
    routes.push({ path: routePath, isTab: tabPaths.has(routePath), source: 'pages' });
  }

  const subPackages = appJson.subPackages || appJson.subpackages || [];
  for (const pkg of subPackages) {
    const root = String(pkg.root || '').replace(/^\/+|\/+$/g, '');
    for (const pagePath of pkg.pages || []) {
      const routePath = normalizeRoute(`${root}/${pagePath}`);
      routes.push({ path: routePath, isTab: tabPaths.has(routePath), source: 'subPackages' });
    }
  }

  return uniqueBy(routes, (item) => item.path);
}

function routeWithQuery(routePath, query) {
  if (!query) return routePath;
  const clean = String(query).replace(/^\?/, '');
  if (!clean) return routePath;
  return `${routePath}?${clean}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function numberFrom(value, fallback = 0) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replace('px', ''));
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function textIncludesUnsafeAction(text) {
  const unsafe = [
    '删除', '移除', '清空', '注销', '退出登录', '退出', '支付', '付款', '购买', '下单',
    '提交', '发送', '确认', '确定', '上传', '发布', '邀请', '授权', '同意', '绑定',
    '解绑', '退款', '取消订单', '删除账号', 'remove', 'delete', 'pay', 'purchase',
    'submit', 'send', 'confirm', 'logout', 'sign out', 'upload', 'publish', 'invite',
    'authorize', 'bind', 'unbind', 'refund', 'order'
  ];
  const value = String(text || '').toLowerCase();
  return unsafe.some((item) => value.includes(item.toLowerCase()));
}

async function safeCall(label, fn, fallback = null) {
  try {
    return await fn();
  } catch (error) {
    return fallback;
  }
}

async function queryAll(page, selector) {
  const result = await safeCall(`query ${selector}`, () => page.$$(selector), []);
  return Array.isArray(result) ? result.filter(Boolean) : [];
}

async function queryOne(page, selector) {
  return safeCall(`query one ${selector}`, () => page.$(selector), null);
}

async function elementInfo(element) {
  const [text, size, offset, wxml, outerWxml, ariaLabel, id, cls, role, hidden, disabled, formType, openType, src] = await Promise.all([
    safeCall('text', () => element.text(), ''),
    safeCall('size', () => element.size(), null),
    safeCall('offset', () => element.offset(), null),
    safeCall('wxml', () => element.wxml(), ''),
    safeCall('outerWxml', () => element.outerWxml(), ''),
    safeCall('aria-label', () => element.attribute('aria-label'), ''),
    safeCall('id', () => element.attribute('id'), ''),
    safeCall('class', () => element.attribute('class'), ''),
    safeCall('role', () => element.attribute('role'), ''),
    safeCall('hidden', () => element.attribute('hidden'), ''),
    safeCall('disabled', () => element.attribute('disabled'), ''),
    safeCall('form-type', () => element.attribute('form-type'), ''),
    safeCall('open-type', () => element.attribute('open-type'), ''),
    safeCall('src', () => element.attribute('src'), '')
  ]);
  return {
    tagName: element.tagName || '',
    text: String(text || '').trim(),
    size: size || null,
    offset: offset || null,
    wxml: String(wxml || ''),
    outerWxml: String(outerWxml || ''),
    attributes: {
      id: String(id || ''),
      class: String(cls || ''),
      ariaLabel: String(ariaLabel || ''),
      role: String(role || ''),
      hidden: String(hidden || ''),
      disabled: String(disabled || ''),
      formType: String(formType || ''),
      openType: String(openType || ''),
      src: String(src || '')
    }
  };
}

function makeFinding({ severity = 'info', category = 'general', title, message, route = '', evidence = null }) {
  return {
    severity,
    category,
    title: title || category,
    message: message || '',
    route,
    evidence,
    time: new Date().toISOString()
  };
}

function severityRank(severity) {
  return { critical: 4, high: 3, medium: 2, low: 1, info: 0 }[severity] || 0;
}

function comparePngFiles(actualPath, baselinePath, diffPath, thresholdRatio = 0.01) {
  if (!fileExists(actualPath) || !fileExists(baselinePath)) {
    return { compared: false, reason: 'missing actual or baseline' };
  }
  const actual = PNG.sync.read(fs.readFileSync(actualPath));
  const baseline = PNG.sync.read(fs.readFileSync(baselinePath));
  if (actual.width !== baseline.width || actual.height !== baseline.height) {
    return {
      compared: true,
      passed: false,
      diffRatio: 1,
      reason: `dimension mismatch actual=${actual.width}x${actual.height} baseline=${baseline.width}x${baseline.height}`
    };
  }

  const diff = new PNG({ width: actual.width, height: actual.height });
  let changed = 0;
  const total = actual.width * actual.height;
  for (let y = 0; y < actual.height; y += 1) {
    for (let x = 0; x < actual.width; x += 1) {
      const idx = (actual.width * y + x) << 2;
      const dr = Math.abs(actual.data[idx] - baseline.data[idx]);
      const dg = Math.abs(actual.data[idx + 1] - baseline.data[idx + 1]);
      const db = Math.abs(actual.data[idx + 2] - baseline.data[idx + 2]);
      const da = Math.abs(actual.data[idx + 3] - baseline.data[idx + 3]);
      const isDifferent = dr + dg + db + da > 48;
      if (isDifferent) changed += 1;
      diff.data[idx] = isDifferent ? 255 : actual.data[idx];
      diff.data[idx + 1] = isDifferent ? 0 : actual.data[idx + 1];
      diff.data[idx + 2] = isDifferent ? 0 : actual.data[idx + 2];
      diff.data[idx + 3] = 255;
    }
  }
  const diffRatio = changed / Math.max(1, total);
  ensureDir(path.dirname(diffPath));
  fs.writeFileSync(diffPath, PNG.sync.write(diff));
  return {
    compared: true,
    passed: diffRatio <= thresholdRatio,
    diffRatio,
    changedPixels: changed,
    totalPixels: total,
    diffPath
  };
}

function copyFileSafe(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function relativeToCwd(file) {
  try {
    return path.relative(process.cwd(), file) || file;
  } catch (_) {
    return file;
  }
}

function envSummary() {
  return {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cwd: process.cwd(),
    home: os.homedir()
  };
}

module.exports = {
  parseArgs,
  boolArg,
  intArg,
  floatArg,
  ensureDir,
  writeJson,
  readJsonSafe,
  fileExists,
  nowStamp,
  defaultCliPath,
  resolveProjectPath,
  resolveMiniProgramRoot,
  normalizeRoute,
  sanitizeName,
  discoverRoutes,
  routeWithQuery,
  sleep,
  numberFrom,
  textIncludesUnsafeAction,
  safeCall,
  queryAll,
  queryOne,
  elementInfo,
  makeFinding,
  severityRank,
  comparePngFiles,
  copyFileSafe,
  relativeToCwd,
  envSummary
};
