'use strict';

const { chromium } = require('playwright');

function resolveHeadless(value) {
  if (value === 'false') return false;
  if (value === 'true') return true;
  return !process.env.DISPLAY && process.platform !== 'darwin' ? true : 'new';
}

(async () => {
  const browser = await chromium.launch({ headless: resolveHeadless(process.env.HEADLESS || 'auto') });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const evidence = { console: [], pageErrors: [] };

  page.on('console', msg => {
    if (['error', 'warning'].includes(msg.type())) {
      evidence.console.push({ type: msg.type(), text: msg.text() });
    }
  });
  page.on('pageerror', err => evidence.pageErrors.push(err.message));

  try {
    await page.goto(process.env.TARGET_URL || 'http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: '/tmp/codex-mobile.png', fullPage: true, animations: 'disabled' });
    console.log(JSON.stringify({ title: await page.title(), url: page.url(), evidence }, null, 2));
  } finally {
    await browser.close();
  }
})();
