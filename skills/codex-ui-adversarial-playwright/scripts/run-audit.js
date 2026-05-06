#!/usr/bin/env node
'use strict';

const path = require('path');
const { chromium, devices } = require('playwright');
const helpers = require('../lib/helpers');
const adversarial = require('../lib/adversarial');
const { writeReports } = require('../lib/report');

async function main() {
  const args = helpers.parseArgs();
  const startedAt = new Date().toISOString();
  const modes = [];
  if (args.fuzz) modes.push('fuzz');
  if (args['network-chaos']) modes.push('network-chaos');
  if (args['rapid-click']) modes.push('rapid-click');

  let targetUrl = args.url || args._[0] || process.env.TARGET_URL;
  if (!targetUrl) {
    const customPorts = args.ports ? String(args.ports).split(',').map((p) => Number(p.trim())) : [];
    const servers = await helpers.detectDevServers(customPorts);
    targetUrl = helpers.chooseDevServer(servers);
    if (!targetUrl) {
      console.error('No --url provided and no local dev server detected.');
      console.error('Usage: node scripts/run-audit.js --url http://localhost:3000');
      process.exit(1);
    }
    console.log(`Auto-selected detected dev server: ${targetUrl}`);
  }

  const runDir = helpers.makeRunDir(args.out);
  const headless = helpers.resolveHeadless(args.headless);
  const browserName = args.browser || 'chromium';

  if (browserName !== 'chromium') {
    console.warn('This audit runner currently defaults to Chromium. Use custom scripts for Firefox/WebKit.');
  }

  const browser = await chromium.launch({
    headless,
    slowMo: Number(args.slowMo || args['slow-mo'] || 0),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const viewports = parseViewports(args.viewports);
  const report = {
    url: targetUrl,
    startedAt,
    finishedAt: null,
    headless,
    browser: browserName,
    runDir,
    modes,
    results: [],
  };

  try {
    for (const viewport of viewports) {
      console.log(`\nTesting ${viewport.name} (${viewport.width}x${viewport.height})`);
      const result = await testViewport({ browser, targetUrl, viewport, runDir, args });
      report.results.push(result);
    }
  } finally {
    await browser.close();
  }

  report.finishedAt = new Date().toISOString();
  const paths = writeReports(runDir, report);
  console.log('\nAudit complete.');
  console.log(`Markdown report: ${paths.mdPath}`);
  console.log(`JSON report: ${paths.jsonPath}`);
}

async function testViewport({ browser, targetUrl, viewport, runDir, args }) {
  const watchers = { console: [], pageErrors: [], failedRequests: [], badResponses: [] };
  const contextOptions = {
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor || 1,
    isMobile: Boolean(viewport.isMobile),
    hasTouch: Boolean(viewport.isMobile),
    ignoreHTTPSErrors: true,
  };

  if (viewport.device && devices[viewport.device]) {
    Object.assign(contextOptions, devices[viewport.device]);
  }

  const headers = helpers.getExtraHeadersFromEnv();
  if (headers) contextOptions.extraHTTPHeaders = headers;

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  helpers.attachPageWatchers(page, watchers);

  if (args['network-chaos']) {
    await adversarial.installNetworkChaos(page, {
      failureRate: args['chaos-rate'] || 0.2,
      delayMs: args['chaos-delay'] || 1200,
    });
  }

  const screenshot = path.join(runDir, 'screenshots', `${viewport.name}.png`);
  const result = {
    viewport,
    finalUrl: null,
    title: null,
    screenshot,
    loadError: null,
    layout: null,
    a11y: null,
    fuzz: null,
    rapidClick: null,
    watchers,
  };

  try {
    await page.goto(targetUrl, { waitUntil: args.waitUntil || 'domcontentloaded', timeout: Number(args.timeout || 30000) });
    await settlePage(page, args);
    result.finalUrl = page.url();
    result.title = await page.title().catch(() => null);

    if (args.fuzz) {
      result.fuzz = await adversarial.safeFuzzInputs(page, {
        maxFields: Number(args['max-fields'] || 8),
        maxPayloads: Number(args['max-payloads'] || 4),
      });
      await settlePage(page, args);
    }

    if (args['rapid-click']) {
      result.rapidClick = await adversarial.rapidClickNonDestructive(page, {
        maxClicks: Number(args['max-clicks'] || 5),
      });
      await settlePage(page, args);
    }

    result.layout = await adversarial.evaluateLayout(page);
    result.a11y = await helpers.runAxeIfAvailable(page);
  } catch (error) {
    result.loadError = error.message;
  }

  try {
    await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled' });
  } catch (error) {
    result.screenshotError = error.message;
  }

  await context.close();
  return result;
}

async function settlePage(page, args) {
  const ms = Number(args.settle || 800);
  try {
    await page.waitForLoadState('networkidle', { timeout: Number(args.networkIdleTimeout || 5000) });
  } catch (_) {
    // Many SPAs keep sockets open; continue after a bounded wait.
  }
  await page.waitForTimeout(ms);
}

function parseViewports(value) {
  if (!value) return adversarial.STANDARD_VIEWPORTS;
  if (value === 'mobile') return adversarial.STANDARD_VIEWPORTS.filter((v) => v.isMobile);
  if (value === 'desktop') return adversarial.STANDARD_VIEWPORTS.filter((v) => !v.isMobile);

  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const known = adversarial.STANDARD_VIEWPORTS.find((v) => v.name === entry);
      if (known) return known;
      const match = entry.match(/^(?<width>\d+)x(?<height>\d+)$/);
      if (!match) throw new Error(`Invalid viewport: ${entry}. Use names or WIDTHxHEIGHT.`);
      return {
        name: entry,
        width: Number(match.groups.width),
        height: Number(match.groups.height),
        isMobile: Number(match.groups.width) <= 480,
      };
    });
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
