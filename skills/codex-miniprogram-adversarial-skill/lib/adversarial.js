'use strict';

const path = require('path');
const {
  ensureDir,
  sanitizeName,
  routeWithQuery,
  sleep,
  numberFrom,
  textIncludesUnsafeAction,
  safeCall,
  queryAll,
  queryOne,
  elementInfo,
  makeFinding,
  comparePngFiles,
  copyFileSafe
} = require('./helpers');

const INTERACTIVE_SELECTORS = ['button', 'navigator', 'input', 'textarea', 'picker', 'slider', 'switch'];
const INSPECT_SELECTORS = ['button', 'navigator', 'input', 'textarea', 'image', 'form', 'scroll-view', 'swiper', 'picker', 'slider', 'switch'];
const FUZZ_VALUES = [
  '测试',
  '  leading and trailing spaces  ',
  '😀🔥🚀中文Mixed123',
  'a'.repeat(256),
  'مرحبا بالعالم',
  'line1\nline2\nline3'
];

async function navigate(miniProgram, route, waitMs, query = '') {
  const target = routeWithQuery(route.path, query);
  let page;
  if (route.isTab) {
    page = await miniProgram.switchTab(route.path);
  } else {
    page = await miniProgram.reLaunch(target);
  }
  await sleep(waitMs);
  if (!page) page = await miniProgram.currentPage();
  return page;
}

async function captureScreenshot(miniProgram, file) {
  ensureDir(path.dirname(file));
  await miniProgram.screenshot({ path: file });
  return file;
}

async function inspectPageWxml(page) {
  const fragments = [];
  const rootSelectors = ['page', 'body', 'view', 'scroll-view'];
  for (const selector of rootSelectors) {
    const root = await queryOne(page, selector);
    if (!root) continue;
    const info = await elementInfo(root);
    if (info.outerWxml) fragments.push(info.outerWxml);
    if (fragments.join('\n').length > 20000) break;
  }
  if (!fragments.length) {
    for (const selector of INSPECT_SELECTORS) {
      const elements = await queryAll(page, selector);
      for (const element of elements.slice(0, 10)) {
        const info = await elementInfo(element);
        if (info.outerWxml) fragments.push(info.outerWxml);
      }
    }
  }
  return fragments.join('\n').slice(0, 50000);
}

async function collectElements(page, selectors = INSPECT_SELECTORS, limitPerSelector = 30) {
  const result = [];
  for (const selector of selectors) {
    const elements = await queryAll(page, selector);
    for (const element of elements.slice(0, limitPerSelector)) {
      const info = await elementInfo(element);
      info.selector = selector;
      result.push({ element, info });
    }
  }
  return result;
}

function layoutFindingsForElement(info, systemInfo, routePath) {
  const findings = [];
  const size = info.size || {};
  const offset = info.offset || {};
  const width = numberFrom(size.width, 0);
  const height = numberFrom(size.height, 0);
  const left = numberFrom(offset.left, 0);
  const top = numberFrom(offset.top, 0);
  const windowWidth = numberFrom(systemInfo.windowWidth || systemInfo.screenWidth, 0);
  const windowHeight = numberFrom(systemInfo.windowHeight || systemInfo.screenHeight, 0);
  const right = left + width;
  const bottom = top + height;

  if (windowWidth && width > windowWidth + 2) {
    findings.push(makeFinding({
      severity: 'medium',
      category: 'layout',
      route: routePath,
      title: '元素宽度超过窗口宽度',
      message: `${info.selector || info.tagName} width=${width}, windowWidth=${windowWidth}`,
      evidence: compactElementEvidence(info)
    }));
  }
  if (windowWidth && (left < -2 || right > windowWidth + 2)) {
    findings.push(makeFinding({
      severity: 'medium',
      category: 'layout',
      route: routePath,
      title: '元素横向越界',
      message: `${info.selector || info.tagName} left=${left}, right=${right}, windowWidth=${windowWidth}`,
      evidence: compactElementEvidence(info)
    }));
  }
  if (windowHeight && top < -8) {
    findings.push(makeFinding({
      severity: 'low',
      category: 'layout',
      route: routePath,
      title: '元素顶部越界',
      message: `${info.selector || info.tagName} top=${top}`,
      evidence: compactElementEvidence(info)
    }));
  }

  const isInteractive = INTERACTIVE_SELECTORS.includes(info.selector) || /bindtap|catchtap/.test(info.outerWxml || '');
  if (isInteractive && width > 0 && height > 0 && (width < 32 || height < 32)) {
    findings.push(makeFinding({
      severity: 'low',
      category: 'touch-target',
      route: routePath,
      title: '可点击区域偏小',
      message: `${info.selector || info.tagName} size=${width}x${height}. 建议小程序可点区域至少接近 32px 以上。`,
      evidence: compactElementEvidence(info)
    }));
  }

  const safeAreaBottom = systemInfo.safeArea && numberFrom(systemInfo.safeArea.bottom, 0);
  if (isInteractive && safeAreaBottom && bottom > safeAreaBottom + 2) {
    findings.push(makeFinding({
      severity: 'medium',
      category: 'safe-area',
      route: routePath,
      title: '可点击元素可能进入底部安全区',
      message: `${info.selector || info.tagName} bottom=${bottom}, safeArea.bottom=${safeAreaBottom}`,
      evidence: compactElementEvidence(info)
    }));
  }

  return findings;
}

function a11yFindingsForElement(info, routePath) {
  const findings = [];
  const text = String(info.text || '').trim();
  const attrs = info.attributes || {};
  const outerWxml = info.outerWxml || '';
  const label = attrs.ariaLabel || attrs.role || text;

  if (info.selector === 'button' && !label && !attrs.openType) {
    findings.push(makeFinding({
      severity: 'medium',
      category: 'accessibility',
      route: routePath,
      title: '按钮缺少可理解名称',
      message: 'button 没有文本、aria-label、role 或 open-type，读屏和自动化识别都可能困难。',
      evidence: compactElementEvidence(info)
    }));
  }

  if (info.selector === 'image') {
    const src = attrs.src || '';
    const looksDecorative = /decor|bg|background|icon|logo/i.test(src + ' ' + attrs.class);
    if (!looksDecorative && !attrs.ariaLabel && !/aria-label=/.test(outerWxml)) {
      findings.push(makeFinding({
        severity: 'low',
        category: 'accessibility',
        route: routePath,
        title: '图片缺少语义说明',
        message: 'image 可能承载内容但没有 aria-label。若只是装饰图，可忽略；若是功能图，应补充可访问说明。',
        evidence: compactElementEvidence(info)
      }));
    }
  }

  if (/bindtap|catchtap/.test(outerWxml) && !text && !attrs.ariaLabel && info.selector !== 'image') {
    findings.push(makeFinding({
      severity: 'low',
      category: 'accessibility',
      route: routePath,
      title: '自定义可点击元素缺少文本/语义',
      message: '检测到 bindtap/catchtap，但元素缺少文本和 aria-label。',
      evidence: compactElementEvidence(info)
    }));
  }

  return findings;
}

function wxmlHeuristicFindings(wxml, routePath) {
  const findings = [];
  if (!wxml) return findings;
  const hiddenInteractive = (wxml.match(/<(button|navigator|view)[^>]*(hidden|display\s*:\s*none)[^>]*(bindtap|catchtap)/g) || []).length;
  if (hiddenInteractive > 0) {
    findings.push(makeFinding({
      severity: 'low',
      category: 'wxml',
      route: routePath,
      title: 'WXML 中存在隐藏的可点击元素',
      message: `检测到 ${hiddenInteractive} 个疑似隐藏但仍绑定点击事件的节点。`,
      evidence: { count: hiddenInteractive }
    }));
  }
  const hardcodedPx = (wxml.match(/style="[^"]*\b(width|left|right):\s*\d+px/g) || []).length;
  if (hardcodedPx > 6) {
    findings.push(makeFinding({
      severity: 'info',
      category: 'responsive',
      route: routePath,
      title: '固定 px 布局较多',
      message: `检测到 ${hardcodedPx} 处固定 px 宽度/位置，建议关注不同机型适配。`,
      evidence: { count: hardcodedPx }
    }));
  }
  return findings;
}

async function runInputFuzz(page, routePath, options) {
  const findings = [];
  const inputs = [
    ...(await queryAll(page, 'input')).slice(0, options.maxInputs || 6),
    ...(await queryAll(page, 'textarea')).slice(0, options.maxInputs || 4)
  ];
  for (let i = 0; i < inputs.length; i += 1) {
    const element = inputs[i];
    const info = await elementInfo(element);
    const unsafe = textIncludesUnsafeAction(info.outerWxml || info.text || '');
    if (unsafe) continue;
    for (const value of FUZZ_VALUES) {
      const before = Date.now();
      try {
        if (typeof element.input === 'function') {
          await element.input(value);
          await sleep(80);
        }
      } catch (error) {
        findings.push(makeFinding({
          severity: 'medium',
          category: 'input-fuzz',
          route: routePath,
          title: '异常输入导致组件错误',
          message: `${info.selector || info.tagName} input failed for value length=${value.length}: ${error.message}`,
          evidence: compactElementEvidence(info)
        }));
      }
      if (Date.now() - before > 2000) {
        findings.push(makeFinding({
          severity: 'low',
          category: 'input-fuzz',
          route: routePath,
          title: '异常输入响应较慢',
          message: `${info.selector || info.tagName} took ${Date.now() - before}ms for value length=${value.length}`,
          evidence: compactElementEvidence(info)
        }));
      }
    }
  }
  return findings;
}

async function runSafeRapidTap(page, routePath, options) {
  const findings = [];
  const candidates = [
    ...(await queryAll(page, 'button')).slice(0, 8),
    ...(await queryAll(page, 'navigator')).slice(0, 8)
  ];

  for (const element of candidates) {
    const info = await elementInfo(element);
    const text = `${info.text} ${info.outerWxml}`;
    if (!text.trim()) continue;
    if (textIncludesUnsafeAction(text)) continue;
    try {
      await element.tap();
      await sleep(60);
      await element.tap();
      await sleep(60);
      await element.tap();
      await sleep(120);
    } catch (error) {
      findings.push(makeFinding({
        severity: 'medium',
        category: 'rapid-tap',
        route: routePath,
        title: '安全快速点击导致错误',
        message: `${info.selector || info.tagName} rapid tap failed: ${error.message}`,
        evidence: compactElementEvidence(info)
      }));
    }
  }
  return findings;
}

async function applyNetworkChaos(miniProgram) {
  await miniProgram.mockWxMethod('request', `function(options) {
    var response = { errMsg: 'request:fail simulated by codex-miniprogram-adversarial-skill', statusCode: 599, data: null };
    setTimeout(function() {
      if (options && typeof options.fail === 'function') options.fail(response);
      if (options && typeof options.complete === 'function') options.complete(response);
    }, 30);
  }`);
}

async function restoreNetworkChaos(miniProgram) {
  await safeCall('restore request mock', () => miniProgram.restoreWxMethod('request'));
}

async function applyPermissionChaos(miniProgram) {
  const failer = `function(options) {
    var response = { errMsg: 'fail auth deny simulated by codex-miniprogram-adversarial-skill' };
    setTimeout(function() {
      if (options && typeof options.fail === 'function') options.fail(response);
      if (options && typeof options.complete === 'function') options.complete(response);
    }, 30);
  }`;
  await safeCall('mock getLocation', () => miniProgram.mockWxMethod('getLocation', failer));
  await safeCall('mock getUserProfile', () => miniProgram.mockWxMethod('getUserProfile', failer));
  await safeCall('mock chooseImage', () => miniProgram.mockWxMethod('chooseImage', failer));
  await safeCall('mock authorize', () => miniProgram.mockWxMethod('authorize', failer));
}

async function restorePermissionChaos(miniProgram) {
  for (const method of ['getLocation', 'getUserProfile', 'chooseImage', 'authorize']) {
    await safeCall(`restore ${method}`, () => miniProgram.restoreWxMethod(method));
  }
}

async function auditRoute(miniProgram, route, context) {
  const { options, systemInfo, paths } = context;
  const findings = [];
  const routeName = sanitizeName(route.path);
  let page;
  let currentPage;
  let screenshotPath;
  const start = Date.now();

  try {
    page = await navigate(miniProgram, route, options.waitMs, options.query || '');
    currentPage = await miniProgram.currentPage();
  } catch (error) {
    findings.push(makeFinding({
      severity: 'high',
      category: 'navigation',
      route: route.path,
      title: '页面导航失败',
      message: error.message
    }));
    return { route, durationMs: Date.now() - start, findings, screenshotPath: null, components: [] };
  }

  if (!page) {
    findings.push(makeFinding({
      severity: 'high',
      category: 'navigation',
      route: route.path,
      title: '无法获取当前页面对象',
      message: 'miniProgram.currentPage() returned empty page.'
    }));
    return { route, durationMs: Date.now() - start, findings, screenshotPath: null, components: [] };
  }

  const actualPath = currentPage && currentPage.path ? `/${currentPage.path.replace(/^\/+/, '')}` : '';
  if (actualPath && actualPath !== route.path && !route.path.includes(actualPath) && !actualPath.includes(route.path.replace(/^\/+/, ''))) {
    findings.push(makeFinding({
      severity: 'low',
      category: 'navigation',
      route: route.path,
      title: '导航后当前页面与目标页面不完全一致',
      message: `target=${route.path}, current=${actualPath}`
    }));
  }

  screenshotPath = path.join(paths.screenshotsDir, `${routeName}.png`);
  try {
    await captureScreenshot(miniProgram, screenshotPath);
  } catch (error) {
    findings.push(makeFinding({
      severity: 'medium',
      category: 'screenshot',
      route: route.path,
      title: '截图失败',
      message: error.message
    }));
  }

  const wxml = await inspectPageWxml(page);
  findings.push(...wxmlHeuristicFindings(wxml, route.path));

  const collected = await collectElements(page);
  const components = collected.map(({ info }) => compactElementEvidence(info));
  for (const { info } of collected) {
    findings.push(...layoutFindingsForElement(info, systemInfo || {}, route.path));
    findings.push(...a11yFindingsForElement(info, route.path));
  }

  if (options.fuzz) {
    findings.push(...await runInputFuzz(page, route.path, options));
  }

  if (options.rapidTap) {
    findings.push(...await runSafeRapidTap(page, route.path, options));
  }

  if (options.compareSnapshots && screenshotPath) {
    const baseline = path.join(paths.baselineDir, `${routeName}.png`);
    const diff = path.join(paths.snapshotDiffDir, `${routeName}.diff.png`);
    const result = safeCall('snapshot compare', () => comparePngFiles(screenshotPath, baseline, diff, options.snapshotThreshold), null);
    const comparison = await result;
    if (comparison && comparison.compared && !comparison.passed) {
      findings.push(makeFinding({
        severity: 'medium',
        category: 'visual-regression',
        route: route.path,
        title: '截图与基线不一致',
        message: comparison.reason || `diffRatio=${comparison.diffRatio}`,
        evidence: comparison
      }));
    } else if (comparison && !comparison.compared) {
      findings.push(makeFinding({
        severity: 'info',
        category: 'visual-regression',
        route: route.path,
        title: '缺少截图基线',
        message: `baseline not found: ${baseline}`
      }));
    }
  }

  if (options.updateSnapshots && screenshotPath) {
    const baseline = path.join(paths.baselineDir, `${routeName}.png`);
    try {
      copyFileSafe(screenshotPath, baseline);
    } catch (error) {
      findings.push(makeFinding({
        severity: 'low',
        category: 'visual-regression',
        route: route.path,
        title: '更新截图基线失败',
        message: error.message
      }));
    }
  }

  return {
    route,
    durationMs: Date.now() - start,
    findings,
    screenshotPath,
    components,
    wxmlPreview: wxml.slice(0, 4000)
  };
}

function compactElementEvidence(info) {
  const size = info.size || {};
  const offset = info.offset || {};
  return {
    selector: info.selector || info.tagName || '',
    tagName: info.tagName || '',
    text: String(info.text || '').slice(0, 120),
    id: info.attributes && info.attributes.id || '',
    class: info.attributes && info.attributes.class || '',
    ariaLabel: info.attributes && info.attributes.ariaLabel || '',
    formType: info.attributes && info.attributes.formType || '',
    openType: info.attributes && info.attributes.openType || '',
    size: {
      width: numberFrom(size.width, 0),
      height: numberFrom(size.height, 0)
    },
    offset: {
      left: numberFrom(offset.left, 0),
      top: numberFrom(offset.top, 0)
    },
    wxml: String(info.outerWxml || info.wxml || '').slice(0, 500)
  };
}

module.exports = {
  auditRoute,
  applyNetworkChaos,
  restoreNetworkChaos,
  applyPermissionChaos,
  restorePermissionChaos
};
