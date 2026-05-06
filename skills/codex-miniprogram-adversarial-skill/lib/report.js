'use strict';

const fs = require('fs');
const path = require('path');
const { ensureDir, writeJson, severityRank } = require('./helpers');

function summarizeFindings(findings) {
  const summary = {
    total: findings.length,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
    byCategory: {}
  };
  for (const finding of findings) {
    const severity = finding.severity || 'info';
    summary[severity] = (summary[severity] || 0) + 1;
    const category = finding.category || 'general';
    summary.byCategory[category] = (summary.byCategory[category] || 0) + 1;
  }
  return summary;
}

function writeReport(report, outDir) {
  ensureDir(outDir);
  const allFindings = report.routes.flatMap((route) => route.findings || []);
  report.summary = summarizeFindings(allFindings);
  report.findings = allFindings.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));

  const jsonPath = path.join(outDir, 'report.json');
  const mdPath = path.join(outDir, 'report.md');
  writeJson(jsonPath, report);
  fs.writeFileSync(mdPath, renderMarkdown(report), 'utf8');
  return { jsonPath, mdPath };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Codex Mini Program Adversarial Audit Report');
  lines.push('');
  lines.push(`- Time: ${report.startedAt}`);
  lines.push(`- Project: ${report.projectPath}`);
  lines.push(`- Mini Program root: ${report.miniProgramRoot}`);
  lines.push(`- Connection mode: ${report.connection && report.connection.mode || 'unknown'}`);
  lines.push(`- Routes audited: ${report.routes.length}`);
  if (report.systemInfo) {
    lines.push(`- Simulator: ${report.systemInfo.brand || ''} ${report.systemInfo.model || ''}`.trim());
    lines.push(`- Window: ${report.systemInfo.windowWidth || '?'}x${report.systemInfo.windowHeight || '?'}`);
    lines.push(`- Platform: ${report.systemInfo.platform || 'unknown'}`);
    lines.push(`- SDK: ${report.systemInfo.SDKVersion || report.systemInfo.sdkVersion || 'unknown'}`);
  }
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  const s = report.summary || {};
  lines.push(`- Total findings: ${s.total || 0}`);
  lines.push(`- Critical: ${s.critical || 0}`);
  lines.push(`- High: ${s.high || 0}`);
  lines.push(`- Medium: ${s.medium || 0}`);
  lines.push(`- Low: ${s.low || 0}`);
  lines.push(`- Info: ${s.info || 0}`);
  lines.push('');

  if (report.console && report.console.length) {
    lines.push('## Console events');
    lines.push('');
    for (const item of report.console.slice(0, 50)) {
      lines.push(`- [${item.level}] ${escapeMd(String(item.text || '').slice(0, 300))}`);
    }
    lines.push('');
  }

  if (report.exceptions && report.exceptions.length) {
    lines.push('## Runtime exceptions');
    lines.push('');
    for (const item of report.exceptions.slice(0, 20)) {
      lines.push('```json');
      lines.push(JSON.stringify(item.raw, null, 2).slice(0, 1200));
      lines.push('```');
    }
    lines.push('');
  }

  lines.push('## Findings');
  lines.push('');
  if (!report.findings || !report.findings.length) {
    lines.push('No findings were detected by the current probes. This does not prove the Mini Program is bug-free; it only means these automated probes did not detect issues.');
    lines.push('');
  } else {
    for (const finding of report.findings) {
      lines.push(`### ${sevIcon(finding.severity)} ${escapeMd(finding.title)}`);
      lines.push('');
      lines.push(`- Severity: ${finding.severity}`);
      lines.push(`- Category: ${finding.category}`);
      lines.push(`- Route: ${finding.route || '-'}`);
      lines.push(`- Message: ${escapeMd(finding.message || '')}`);
      if (finding.evidence) {
        lines.push('- Evidence:');
        lines.push('```json');
        lines.push(JSON.stringify(finding.evidence, null, 2).slice(0, 1800));
        lines.push('```');
      }
      lines.push('');
    }
  }

  lines.push('## Route details');
  lines.push('');
  for (const route of report.routes) {
    lines.push(`### ${escapeMd(route.route.path)}`);
    lines.push('');
    lines.push(`- Source: ${route.route.source || '-'}`);
    lines.push(`- Tab page: ${route.route.isTab ? 'yes' : 'no'}`);
    lines.push(`- Duration: ${route.durationMs}ms`);
    if (route.screenshotPath) lines.push(`- Screenshot: ${route.screenshotPath}`);
    lines.push(`- Components inspected: ${(route.components || []).length}`);
    lines.push(`- Findings: ${(route.findings || []).length}`);
    lines.push('');
  }

  lines.push('## Suggested next steps');
  lines.push('');
  lines.push('1. Fix high and medium findings first.');
  lines.push('2. Re-run the same audit command to verify.');
  lines.push('3. Convert confirmed regressions into formal tests with `templates/formal-miniprogram-regression.test.js`.');
  lines.push('4. Use `--update-snapshots` only after UI changes are intentionally accepted.');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function sevIcon(severity) {
  return {
    critical: '🛑',
    high: '🚨',
    medium: '⚠️',
    low: '🔎',
    info: 'ℹ️'
  }[severity] || 'ℹ️';
}

function escapeMd(value) {
  return String(value || '').replace(/\|/g, '\\|');
}

module.exports = {
  writeReport,
  summarizeFindings
};
