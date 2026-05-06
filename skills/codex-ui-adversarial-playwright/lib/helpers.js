'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

function parseArgs(argv = process.argv.slice(2)) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }

    const eq = token.indexOf('=');
    if (eq > -1) {
      const key = token.slice(2, eq);
      args[key] = coerceValue(token.slice(eq + 1));
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = coerceValue(next);
      i += 1;
    }
  }
  return args;
}

function coerceValue(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^-?\d+$/.test(value)) return Number(value);
  return value;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function projectDirFromCwd() {
  return process.env.PROJECT_DIR || process.cwd();
}

function makeRunDir(outRoot) {
  const root = outRoot || path.join(projectDirFromCwd(), '.codex', 'ui-audit');
  const runDir = path.join(root, timestamp());
  ensureDir(runDir);
  ensureDir(path.join(runDir, 'screenshots'));
  return runDir;
}

function resolveHeadless(value = process.env.HEADLESS || process.env.CODEX_PW_HEADLESS || 'auto') {
  if (typeof value === 'boolean') return value;
  const normalized = String(value).toLowerCase();
  if (['false', '0', 'no', 'headed'].includes(normalized)) return false;
  if (['true', '1', 'yes', 'headless'].includes(normalized)) return true;

  if (process.env.CI) return true;
  if (process.platform !== 'win32' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) return true;
  return false;
}

function getExtraHeadersFromEnv() {
  const headerName = process.env.PW_HEADER_NAME;
  const headerValue = process.env.PW_HEADER_VALUE;
  if (headerName && headerValue) return { [headerName]: headerValue };

  const headersJson = process.env.PW_EXTRA_HEADERS;
  if (!headersJson) return undefined;

  try {
    const parsed = JSON.parse(headersJson);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    console.warn('PW_EXTRA_HEADERS must be a JSON object; ignoring it.');
  } catch (error) {
    console.warn(`Failed to parse PW_EXTRA_HEADERS: ${error.message}`);
  }
  return undefined;
}

async function detectDevServers(customPorts = []) {
  const commonPorts = [5173, 3000, 3001, 3002, 8080, 8000, 4200, 5000, 9000, 1234, 6006];
  const allPorts = [...new Set([...customPorts.map(Number).filter(Boolean), ...commonPorts])];
  const detectedServers = [];

  for (const port of allPorts) {
    const detected = await probeLocalhostPort(port);
    if (detected) detectedServers.push(`http://localhost:${port}`);
  }

  return detectedServers;
}

function probeLocalhostPort(port) {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: 'localhost', port, path: '/', method: 'HEAD', timeout: 700 },
      (res) => {
        resolve(res.statusCode && res.statusCode < 500);
        res.resume();
      },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

function chooseDevServer(servers) {
  if (!Array.isArray(servers) || servers.length === 0) return null;
  const priority = [5173, 3000, 3001, 8080, 3002, 8000, 4200, 5000, 9000, 1234, 6006];
  return [...servers].sort((a, b) => {
    const portA = Number(new URL(a).port);
    const portB = Number(new URL(b).port);
    return priority.indexOf(portA) - priority.indexOf(portB);
  })[0];
}

function attachPageWatchers(page, bucket) {
  page.on('console', (msg) => {
    const type = msg.type();
    if (['error', 'warning'].includes(type)) {
      bucket.console.push({ type, text: msg.text(), location: safeLocation(msg) });
    }
  });

  page.on('pageerror', (error) => {
    bucket.pageErrors.push({ message: error.message, stack: error.stack });
  });

  page.on('requestfailed', (request) => {
    bucket.failedRequests.push({
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      failure: request.failure() ? request.failure().errorText : 'unknown',
    });
  });

  page.on('response', (response) => {
    const status = response.status();
    if (status >= 400) {
      bucket.badResponses.push({ url: response.url(), status, statusText: response.statusText() });
    }
  });
}

function safeLocation(msg) {
  try {
    return msg.location();
  } catch (_) {
    return undefined;
  }
}

async function runAxeIfAvailable(page) {
  try {
    const mod = require('@axe-core/playwright');
    const AxeBuilder = mod.default || mod.AxeBuilder || mod;
    const results = await new AxeBuilder({ page }).analyze();
    return {
      available: true,
      violationCount: results.violations.length,
      violations: results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        help: v.help,
        helpUrl: v.helpUrl,
        nodes: v.nodes.slice(0, 5).map((node) => ({
          target: node.target,
          failureSummary: node.failureSummary,
        })),
      })),
    };
  } catch (error) {
    return { available: false, skippedReason: error.message };
  }
}

function readJsonMaybe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function tmpScriptPath(prefix = 'codex-ui') {
  return path.join(os.tmpdir(), `${prefix}-${timestamp()}.js`);
}

module.exports = {
  parseArgs,
  ensureDir,
  timestamp,
  projectDirFromCwd,
  makeRunDir,
  resolveHeadless,
  getExtraHeadersFromEnv,
  detectDevServers,
  chooseDevServer,
  attachPageWatchers,
  runAxeIfAvailable,
  readJsonMaybe,
  tmpScriptPath,
};
