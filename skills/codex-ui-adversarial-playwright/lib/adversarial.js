'use strict';

const STANDARD_VIEWPORTS = [
  { name: 'mobile-320', width: 320, height: 568, isMobile: true },
  { name: 'mobile-390', width: 390, height: 844, isMobile: true },
  { name: 'tablet-768', width: 768, height: 1024, isMobile: true },
  { name: 'desktop-1366', width: 1366, height: 768 },
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'short-height', width: 1280, height: 540 },
  { name: 'ultrawide', width: 1920, height: 720 },
];

const FUZZ_INPUTS = [
  '',
  ' '.repeat(64),
  'a'.repeat(512),
  '中文测试'.repeat(40),
  '😀🔥🚀'.repeat(40),
  'مرحبا بالعالم '.repeat(30),
  'line1\nline2\nline3\n'.repeat(20),
  '<script>alert(1)</script>',
  'Robert"); DROP TABLE users;--',
];

const DANGEROUS_TEXT_RE = /delete|remove|destroy|pay|purchase|buy|checkout|send|invite|transfer|confirm|取消订阅|删除|移除|支付|购买|发送|邀请|转账|确认/i;

async function evaluateLayout(page) {
  return page.evaluate(() => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const doc = document.documentElement;
    const body = document.body;
    const scrollWidth = Math.max(doc.scrollWidth, body ? body.scrollWidth : 0);
    const scrollHeight = Math.max(doc.scrollHeight, body ? body.scrollHeight : 0);

    const isVisible = (el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };

    const selector = 'a, button, input, textarea, select, [role="button"], [tabindex]:not([tabindex="-1"])';
    const interactive = Array.from(document.querySelectorAll(selector)).filter(isVisible).slice(0, 300);

    const issues = [];
    for (const el of interactive) {
      const rect = el.getBoundingClientRect();
      const label = (
        el.getAttribute('aria-label') ||
        el.getAttribute('name') ||
        el.getAttribute('placeholder') ||
        el.textContent ||
        el.id ||
        el.tagName
      ).trim().slice(0, 120);

      if (rect.width < 4 || rect.height < 4) {
        issues.push({ type: 'tiny-interactive', label, tag: el.tagName, rect: toRect(rect) });
      }
      if (rect.left < -2 || rect.top < -2 || rect.right > viewport.width + 2 || rect.bottom > viewport.height + 2) {
        issues.push({ type: 'interactive-outside-viewport', label, tag: el.tagName, rect: toRect(rect) });
      }

      const cx = Math.min(Math.max(rect.left + rect.width / 2, 0), viewport.width - 1);
      const cy = Math.min(Math.max(rect.top + rect.height / 2, 0), viewport.height - 1);
      const topEl = document.elementFromPoint(cx, cy);
      if (topEl && topEl !== el && !el.contains(topEl) && !topEl.contains(el)) {
        const topStyle = window.getComputedStyle(topEl);
        if (topStyle.pointerEvents !== 'none') {
          issues.push({
            type: 'possibly-covered-interactive',
            label,
            tag: el.tagName,
            coveringTag: topEl.tagName,
            coveringText: (topEl.textContent || topEl.getAttribute('aria-label') || '').trim().slice(0, 80),
            rect: toRect(rect),
          });
        }
      }
    }

    const fixedElements = Array.from(document.querySelectorAll('*'))
      .filter((el) => window.getComputedStyle(el).position === 'fixed' && isVisible(el))
      .slice(0, 60)
      .map((el) => ({
        tag: el.tagName,
        text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 120),
        rect: toRect(el.getBoundingClientRect()),
        zIndex: window.getComputedStyle(el).zIndex,
      }));

    return {
      viewport,
      scroll: { width: scrollWidth, height: scrollHeight },
      hasHorizontalOverflow: scrollWidth > viewport.width + 2,
      interactiveCount: interactive.length,
      issues,
      fixedElements,
    };

    function toRect(rect) {
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        left: Math.round(rect.left),
      };
    }
  });
}

async function safeFuzzInputs(page, options = {}) {
  const maxFields = options.maxFields || 8;
  const maxPayloads = options.maxPayloads || 4;
  const payloads = FUZZ_INPUTS.slice(0, maxPayloads);
  const results = [];

  const locators = await page.locator('input:not([type="hidden"]):not([type="file"]), textarea, [contenteditable="true"]').all();
  const targets = locators.slice(0, maxFields);

  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    let meta = { index };
    try {
      meta = await target.evaluate((el, i) => ({
        index: i,
        tag: el.tagName,
        name: el.getAttribute('name'),
        type: el.getAttribute('type'),
        placeholder: el.getAttribute('placeholder'),
        ariaLabel: el.getAttribute('aria-label'),
      }), index);
    } catch (error) {
      results.push({ index, skipped: true, reason: `metadata failed: ${error.message}` });
      continue;
    }

    for (const payload of payloads) {
      try {
        await target.scrollIntoViewIfNeeded({ timeout: 2000 });
        await target.fill('', { timeout: 2000 });
        await target.fill(payload, { timeout: 3000 });
        await page.waitForTimeout(80);
        results.push({ ...meta, payloadPreview: preview(payload), ok: true });
      } catch (error) {
        results.push({ ...meta, payloadPreview: preview(payload), ok: false, error: error.message });
      }
    }
  }

  return results;
}

async function installNetworkChaos(page, options = {}) {
  const failureRate = Number(options.failureRate || 0.2);
  const delayMs = Number(options.delayMs || 1200);
  const affectedTypes = new Set(['xhr', 'fetch']);

  await page.route('**/*', async (route) => {
    const request = route.request();
    if (!affectedTypes.has(request.resourceType())) {
      return route.continue();
    }

    const roll = Math.random();
    if (roll < failureRate) {
      return route.abort('failed');
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return route.continue();
  });
}

async function rapidClickNonDestructive(page, options = {}) {
  const maxClicks = options.maxClicks || 10;
  const buttons = await page.locator('button, [role="button"], a[href]').all();
  const clicked = [];

  for (const item of buttons.slice(0, 40)) {
    let text = '';
    try {
      text = (await item.innerText({ timeout: 500 })).trim();
    } catch (_) {
      text = '';
    }
    if (DANGEROUS_TEXT_RE.test(text)) continue;

    try {
      await item.scrollIntoViewIfNeeded({ timeout: 1000 });
      for (let i = 0; i < Math.min(maxClicks, 5); i += 1) {
        await item.click({ timeout: 1000 });
      }
      clicked.push({ text: text.slice(0, 120), ok: true });
      if (clicked.length >= 5) break;
    } catch (error) {
      clicked.push({ text: text.slice(0, 120), ok: false, error: error.message });
    }
  }

  return clicked;
}

function preview(value) {
  if (value.length <= 80) return value;
  return `${value.slice(0, 80)}…(${value.length} chars)`;
}

module.exports = {
  STANDARD_VIEWPORTS,
  FUZZ_INPUTS,
  evaluateLayout,
  safeFuzzInputs,
  installNetworkChaos,
  rapidClickNonDestructive,
};
