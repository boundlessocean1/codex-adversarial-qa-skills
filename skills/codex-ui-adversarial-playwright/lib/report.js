'use strict';

const fs = require('fs');
const path = require('path');

function writeReports(runDir, report) {
  const jsonPath = path.join(runDir, 'report.json');
  const mdPath = path.join(runDir, 'report.md');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdPath, renderMarkdown(report));
  return { jsonPath, mdPath };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push(`# Codex UI Audit Report`);
  lines.push('');
  lines.push(`- URL: ${report.url}`);
  lines.push(`- Started: ${report.startedAt}`);
  lines.push(`- Finished: ${report.finishedAt}`);
  lines.push(`- Headless: ${report.headless}`);
  lines.push(`- Run directory: ${report.runDir}`);
  lines.push(`- Modes: ${report.modes.join(', ') || 'safe'}`);
  lines.push('');

  const summary = summarize(report);
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Viewports tested: ${summary.viewports}`);
  lines.push(`- Layout issues: ${summary.layoutIssues}`);
  lines.push(`- Console warnings/errors: ${summary.console}`);
  lines.push(`- Page errors: ${summary.pageErrors}`);
  lines.push(`- Failed requests: ${summary.failedRequests}`);
  lines.push(`- HTTP >= 400 responses: ${summary.badResponses}`);
  lines.push(`- Accessibility violations: ${summary.a11y}`);
  lines.push('');

  lines.push('## Findings');
  lines.push('');
  const findings = collectFindings(report);
  if (findings.length === 0) {
    lines.push('No high-confidence issues found by the automated audit. Manual exploration may still be needed for business logic and authenticated flows.');
  } else {
    findings.forEach((finding, index) => {
      lines.push(`### ${index + 1}. [${finding.severity}] ${finding.title}`);
      lines.push('');
      lines.push(`- Viewport: ${finding.viewport || 'n/a'}`);
      if (finding.screenshot) lines.push(`- Screenshot: ${finding.screenshot}`);
      lines.push(`- Evidence: ${finding.evidence}`);
      lines.push(`- Suggested fix: ${finding.fix}`);
      lines.push('');
    });
  }

  lines.push('## Per-viewport evidence');
  lines.push('');
  for (const result of report.results) {
    lines.push(`### ${result.viewport.name} (${result.viewport.width}x${result.viewport.height})`);
    lines.push('');
    lines.push(`- Final URL: ${result.finalUrl || 'n/a'}`);
    lines.push(`- Title: ${result.title || 'n/a'}`);
    lines.push(`- Screenshot: ${result.screenshot || 'n/a'}`);
    lines.push(`- Horizontal overflow: ${result.layout && result.layout.hasHorizontalOverflow ? 'yes' : 'no'}`);
    lines.push(`- Layout issues: ${result.layout && result.layout.issues ? result.layout.issues.length : 0}`);
    lines.push(`- Console warnings/errors: ${result.watchers.console.length}`);
    lines.push(`- Page errors: ${result.watchers.pageErrors.length}`);
    lines.push(`- Failed requests: ${result.watchers.failedRequests.length}`);
    lines.push(`- HTTP >= 400 responses: ${result.watchers.badResponses.length}`);
    if (result.a11y && result.a11y.available) {
      lines.push(`- axe violations: ${result.a11y.violationCount}`);
    } else {
      lines.push(`- axe: skipped${result.a11y && result.a11y.skippedReason ? ` (${result.a11y.skippedReason})` : ''}`);
    }
    lines.push('');
  }

  lines.push('## Suggested Playwright Test coverage');
  lines.push('');
  lines.push('- Add a smoke test that loads the page and asserts no critical console/page errors.');
  lines.push('- Add responsive tests for any viewport with overflow or clipped interactive elements.');
  lines.push('- Add `@axe-core/playwright` checks on core pages.');
  lines.push('- Add `toHaveScreenshot()` only after masking dynamic regions and disabling animations.');
  lines.push('- Convert confirmed adversarial failures into deterministic tests with mocked network/data.');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function summarize(report) {
  return report.results.reduce(
    (acc, result) => {
      acc.viewports += 1;
      acc.layoutIssues += result.layout && result.layout.issues ? result.layout.issues.length : 0;
      acc.console += result.watchers.console.length;
      acc.pageErrors += result.watchers.pageErrors.length;
      acc.failedRequests += result.watchers.failedRequests.length;
      acc.badResponses += result.watchers.badResponses.length;
      acc.a11y += result.a11y && result.a11y.available ? result.a11y.violationCount : 0;
      return acc;
    },
    { viewports: 0, layoutIssues: 0, console: 0, pageErrors: 0, failedRequests: 0, badResponses: 0, a11y: 0 },
  );
}

function collectFindings(report) {
  const findings = [];
  for (const result of report.results) {
    if (result.loadError) {
      findings.push({
        severity: 'high',
        title: 'Page failed to load',
        viewport: result.viewport.name,
        screenshot: result.screenshot,
        evidence: result.loadError,
        fix: 'Check routing, dev server health, authentication redirects, and page runtime errors.',
      });
    }

    if (result.layout && result.layout.hasHorizontalOverflow) {
      findings.push({
        severity: 'medium',
        title: 'Horizontal overflow detected',
        viewport: result.viewport.name,
        screenshot: result.screenshot,
        evidence: `Document scroll width ${result.layout.scroll.width}px exceeds viewport width ${result.layout.viewport.width}px.`,
        fix: 'Inspect fixed-width containers, tables, long strings, absolute/fixed elements, and missing responsive wrapping.',
      });
    }

    const clipped = result.layout && result.layout.issues
      ? result.layout.issues.filter((issue) => issue.type === 'interactive-outside-viewport')
      : [];
    if (clipped.length > 0) {
      findings.push({
        severity: 'medium',
        title: 'Interactive elements are outside the viewport',
        viewport: result.viewport.name,
        screenshot: result.screenshot,
        evidence: clipped.slice(0, 3).map((i) => `${i.tag} "${i.label}" at ${JSON.stringify(i.rect)}`).join('; '),
        fix: 'Adjust responsive layout, sticky/fixed positioning, wrapping, and scroll containers so actionable controls remain reachable.',
      });
    }

    if (result.watchers.pageErrors.length > 0) {
      findings.push({
        severity: 'high',
        title: 'Runtime page errors detected',
        viewport: result.viewport.name,
        screenshot: result.screenshot,
        evidence: result.watchers.pageErrors.slice(0, 2).map((e) => e.message).join('; '),
        fix: 'Open the browser console/trace, reproduce the failing viewport, and fix the thrown exception before adding regression coverage.',
      });
    }

    const badA11y = result.a11y && result.a11y.available
      ? result.a11y.violations.filter((v) => ['critical', 'serious'].includes(v.impact))
      : [];
    if (badA11y.length > 0) {
      findings.push({
        severity: 'medium',
        title: 'Serious accessibility violations detected',
        viewport: result.viewport.name,
        screenshot: result.screenshot,
        evidence: badA11y.slice(0, 3).map((v) => `${v.id}: ${v.help}`).join('; '),
        fix: 'Fix semantic labels, contrast, focus management, ARIA usage, and keyboard reachability according to the linked axe guidance.',
      });
    }
  }

  return findings;
}

module.exports = { writeReports, renderMarkdown, summarize, collectFindings };
