'use strict';

const path = require('path');
const { defaultCliPath, fileExists } = require('./helpers');

function requireAutomator() {
  try {
    return require('miniprogram-automator');
  } catch (error) {
    const hint = 'miniprogram-automator is not installed. Run npm run setup inside this skill directory.';
    error.message = `${hint}\nOriginal error: ${error.message}`;
    throw error;
  }
}

async function createMiniProgram(options) {
  const automator = requireAutomator();
  const projectPath = path.resolve(options.projectPath);
  if (options.wsEndpoint) {
    const miniProgram = await automator.connect({ wsEndpoint: options.wsEndpoint });
    return { miniProgram, mode: 'connect', endpoint: options.wsEndpoint };
  }

  const cliPath = options.cliPath || process.env.WECHAT_DEVTOOLS_CLI || defaultCliPath();
  if (!cliPath || !fileExists(cliPath)) {
    throw new Error(
      `WeChat Developer Tools CLI was not found. Pass --cli-path or set WECHAT_DEVTOOLS_CLI. Tried: ${cliPath || '(empty)'}`
    );
  }

  const launchOptions = {
    projectPath,
    cliPath,
    timeout: options.timeout || 45000,
    trustProject: options.trustProject !== false
  };
  if (options.port) launchOptions.port = Number(options.port);
  if (options.account) launchOptions.account = String(options.account);
  if (options.ticket) launchOptions.ticket = String(options.ticket);

  const miniProgram = await automator.launch(launchOptions);
  return { miniProgram, mode: 'launch', cliPath };
}

function installEventCapture(miniProgram, report) {
  miniProgram.on('console', (event) => {
    const level = event && (event.level || event.type || event.method) || 'log';
    const text = event && (event.text || event.args || event.message || JSON.stringify(event));
    report.console.push({ level, text: String(text || ''), time: new Date().toISOString(), raw: event });
  });
  miniProgram.on('exception', (event) => {
    report.exceptions.push({ time: new Date().toISOString(), raw: event });
  });
}

async function safeClose(miniProgram, mode) {
  if (!miniProgram) return;
  try {
    if (mode === 'connect') {
      miniProgram.disconnect();
    } else {
      await miniProgram.close();
    }
  } catch (_) {
    try { miniProgram.disconnect(); } catch (__) {}
  }
}

module.exports = {
  createMiniProgram,
  installEventCapture,
  safeClose
};
