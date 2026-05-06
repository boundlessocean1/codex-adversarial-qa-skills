#!/usr/bin/env node
'use strict';

const path = require('path');
const {
  parseArgs,
  boolArg,
  intArg,
  floatArg,
  ensureDir,
  nowStamp,
  resolveProjectPath,
  resolveMiniProgramRoot,
  discoverRoutes,
  envSummary,
  makeFinding
} = require('../lib/helpers');
const { createMiniProgram, installEventCapture, safeClose } = require('../lib/connector');
const {
  auditRoute,
  applyNetworkChaos,
  restoreNetworkChaos,
  applyPermissionChaos,
  restorePermissionChaos
} = require('../lib/adversarial');
const { writeReport } = require('../lib/report');

async function main() {
  const raw = parseArgs(process.argv.slice(2));
  if (raw.help || raw.h) {
    printHelp();
    return;
  }

  const projectPath = resolveProjectPath(raw.project || raw.projectPath || process.cwd());
  const miniProgramRoot = resolveMiniProgramRoot(projectPath);
  const timestamp = nowStamp();
  const defaultOut = path.join(projectPath, '.codex', 'miniprogram-audit', timestamp);
  const outDir = path.resolve(raw.out || defaultOut);
  const screenshotsDir = path.join(outDir, 'screenshots');
  const snapshotsDir = path.join(outDir, 'snapshots');
  const snapshotDiffDir = path.join(outDir, 'snapshot-diff');
  const baselineDir = path.resolve(raw.baselineDir || path.join(projectPath, '.codex', 'miniprogram-snapshots'));
  ensureDir(outDir);
  ensureDir(screenshotsDir);
  ensureDir(snapshotsDir);
  ensureDir(snapshotDiffDir);
  ensureDir(baselineDir);

  const options = {
    projectPath,
    miniProgramRoot,
    cliPath: raw.cliPath || process.env.WECHAT_DEVTOOLS_CLI,
    wsEndpoint: raw.wsEndpoint || process.env.WEAPP_WS_ENDPOINT,
    port: raw.port ? intArg(raw.port, undefined) : undefined,
    account: raw.account || process.env.WECHAT_AUTOMATOR_ACCOUNT,
    ticket: raw.ticket || process.env.WECHAT_AUTOMATOR_TICKET,
    timeout: intArg(raw.timeout, 45000),
    waitMs: intArg(raw.wait, 1200),
    routesArg: raw.routes || raw.route || 'auto',
    maxRoutes: intArg(raw.maxRoutes, raw.routes === 'all' ? 50 : 8),
    fuzz: boolArg(raw.fuzz, false),
    rapidTap: boolArg(raw.rapidTap, false),
    networkChaos: boolArg(raw.networkChaos, false),
    permissionChaos: boolArg(raw.permissionChaos, false),
    chaosRoutes: intArg(raw.chaosRoutes, 1),
    updateSnapshots: boolArg(raw.updateSnapshots, false),
    compareSnapshots: boolArg(raw.compareSnapshots, false),
    snapshotThreshold: floatArg(raw.snapshotThreshold, 0.01),
    query: raw.query || '',
    close: boolArg(raw.close, !raw.wsEndpoint),
    trustProject: !boolArg(raw.noTrustProject, false)
  };

  const routes = discoverRoutes(projectPath, options.routesArg).slice(0, options.maxRoutes);
  if (!routes.length) {
    throw new Error('No Mini Program routes found. Pass --routes /pages/index/index or check app.json.');
  }

  const report = {
    tool: 'codex-miniprogram-adversarial-skill',
    version: '0.1.0',
    startedAt: new Date().toISOString(),
    projectPath,
    miniProgramRoot,
    outDir,
    options: sanitizeOptions(options),
    env: envSummary(),
    connection: null,
    systemInfo: null,
    routesDiscovered: routes,
    routes: [],
    console: [],
    exceptions: [],
    findings: [],
    summary: {}
  };

  let miniProgram;
  let connection;
  try {
    console.log(`[codex-miniprogram] project: ${projectPath}`);
    console.log(`[codex-miniprogram] routes: ${routes.map((r) => r.path).join(', ')}`);
    connection = await createMiniProgram(options);
    miniProgram = connection.miniProgram;
    report.connection = { mode: connection.mode, cliPath: connection.cliPath || '', endpoint: connection.endpoint || '' };
    installEventCapture(miniProgram, report);

    report.systemInfo = await miniProgram.systemInfo().catch((error) => ({ error: error.message }));
    console.log(`[codex-miniprogram] connected via ${connection.mode}`);

    if (options.permissionChaos) {
      await applyPermissionChaos(miniProgram);
      report.findings.push(makeFinding({
        severity: 'info',
        category: 'chaos',
        title: '已启用权限拒绝 chaos mock',
        message: 'getLocation/getUserProfile/chooseImage/authorize are mocked to fail where supported.'
      }));
    }

    for (let i = 0; i < routes.length; i += 1) {
      const route = routes[i];
      const shouldChaos = options.networkChaos && i < options.chaosRoutes;
      if (shouldChaos) {
        await applyNetworkChaos(miniProgram);
        report.findings.push(makeFinding({
          severity: 'info',
          category: 'chaos',
          route: route.path,
          title: '已启用网络失败 chaos mock',
          message: 'wx.request is mocked to fail on this route where supported.'
        }));
      }

      console.log(`[codex-miniprogram] auditing ${i + 1}/${routes.length}: ${route.path}`);
      const routeReport = await auditRoute(miniProgram, route, {
        options,
        systemInfo: report.systemInfo || {},
        paths: { outDir, screenshotsDir, snapshotsDir, snapshotDiffDir, baselineDir }
      });
      if (shouldChaos) await restoreNetworkChaos(miniProgram);
      report.routes.push(routeReport);
    }

    if (options.permissionChaos) await restorePermissionChaos(miniProgram);

    // Convert runtime exceptions and severe console logs into findings.
    for (const item of report.exceptions) {
      report.findings.push(makeFinding({
        severity: 'high',
        category: 'runtime-exception',
        title: '小程序运行时异常',
        message: JSON.stringify(item.raw).slice(0, 500),
        evidence: item.raw
      }));
    }
    for (const item of report.console) {
      const level = String(item.level || '').toLowerCase();
      const text = String(item.text || '');
      if (level.includes('error') || /error|exception|fail/i.test(text)) {
        report.findings.push(makeFinding({
          severity: 'medium',
          category: 'console',
          title: '控制台错误/失败日志',
          message: text.slice(0, 500),
          evidence: item.raw || item
        }));
      }
    }
  } finally {
    if (miniProgram && options.close) {
      await safeClose(miniProgram, connection && connection.mode);
    }
  }

  report.finishedAt = new Date().toISOString();
  const paths = writeReport(report, outDir);
  console.log(`[codex-miniprogram] report: ${paths.mdPath}`);
  console.log(`[codex-miniprogram] json: ${paths.jsonPath}`);

  const highOrWorse = (report.summary.high || 0) + (report.summary.critical || 0);
  if (highOrWorse > 0 && boolArg(raw.failOnHigh, false)) {
    process.exitCode = 2;
  }
}

function sanitizeOptions(options) {
  const copy = { ...options };
  delete copy.ticket;
  delete copy.account;
  return copy;
}

function printHelp() {
  console.log(`
Codex Mini Program Adversarial Audit

Usage:
  node scripts/run-audit.js --project /path/to/miniprogram

Options:
  --project <path>              WeChat Mini Program project root. Defaults to cwd.
  --cli-path <path>             WeChat Developer Tools CLI path.
  --ws-endpoint <ws://...>      Connect to an existing automation endpoint.
  --routes auto|all|a,b         Routes to audit. Default: auto.
  --max-routes <n>              Max routes to audit. Default: 8, or 50 for --routes all.
  --wait <ms>                   Wait after navigation. Default: 1200.
  --fuzz                        Fuzz input and textarea fields.
  --rapid-tap                   Safely rapid-tap non-destructive buttons/navigators.
  --network-chaos               Mock wx.request failure on first route by default.
  --chaos-routes <n>            Number of routes to run with network chaos. Default: 1.
  --permission-chaos            Mock common permission/media wx APIs to fail.
  --update-snapshots            Save screenshots as baselines.
  --compare-snapshots           Compare screenshots against baselines.
  --snapshot-threshold <ratio>  Visual diff ratio threshold. Default: 0.01.
  --out <path>                  Output directory.
  --fail-on-high                Exit with code 2 when high/critical findings exist.
`);
}

main().catch((error) => {
  console.error('[codex-miniprogram] failed:', error && error.stack || error);
  process.exitCode = 1;
});
