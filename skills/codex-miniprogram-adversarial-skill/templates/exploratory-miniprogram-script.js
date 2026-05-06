'use strict';

const automator = require('miniprogram-automator');

(async () => {
  const miniProgram = await automator.launch({
    projectPath: process.env.PROJECT_PATH || process.cwd(),
    cliPath: process.env.WECHAT_DEVTOOLS_CLI,
    trustProject: true
  });

  try {
    const page = await miniProgram.reLaunch(process.env.MP_ROUTE || '/pages/index/index');
    await page.waitFor(1200);

    console.log('systemInfo:', await miniProgram.systemInfo());
    console.log('currentPage:', await miniProgram.currentPage());
    console.log('pageStack:', await miniProgram.pageStack());

    const buttons = await page.$$('button');
    for (const button of buttons.slice(0, 10)) {
      console.log('button:', {
        text: await button.text().catch(() => ''),
        size: await button.size().catch(() => null),
        offset: await button.offset().catch(() => null),
        wxml: await button.outerWxml().catch(() => '')
      });
    }

    await miniProgram.screenshot({ path: 'miniprogram-exploratory.png' });
  } finally {
    await miniProgram.close().catch(() => miniProgram.disconnect());
  }
})();
