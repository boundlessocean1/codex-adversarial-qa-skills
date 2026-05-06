# Codex Adversarial QA Skills

一套给 **Codex** 用的 UI 对抗性测试 Skills，包含 Web/H5 和微信小程序两部分。

## 包含什么

| Skill                                 | 用来测什么                                        | 主要能力                                                     |
| ------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------ |
| `codex-ui-adversarial-playwright`     | Web、H5、管理后台、React、Vue、Next.js、Vite 页面 | 移动端布局、按钮遮挡、console 错误、请求失败、无障碍、异常输入、截图报告、Playwright Test 用例生成 |
| `codex-miniprogram-adversarial-skill` | 微信小程序原生页面                                | 页面巡检、页面栈、截图、safe-area、点击区域、异常输入、快速点击、网络异常、权限拒绝、报告生成 |

## 一键安装

### 方式一：本地安装

```bash
git clone https://github.com/boundlessocean1/codex-adversarial-qa-skills.git
cd codex-adversarial-qa-skills
npm run install:skills
```

国内网络可以用：

```bash
NPM_REGISTRY=https://registry.npmmirror.com npm run install:skills
```

安装后会复制到：

```txt
~/.agents/skills/
  codex-ui-adversarial-playwright/
  codex-miniprogram-adversarial-skill/
```

安装完成后重启 Codex，或在 Codex 里查看 `/skills`。

### 方式二：给 Codex 的一行命令

把下面这句话直接发给 Codex：

```txt
请执行：git clone https://github.com/boundlessocean1/codex-adversarial-qa-skills.git /tmp/codex-adversarial-qa-skills && cd /tmp/codex-adversarial-qa-skills && npm run install:skills && npm run doctor
```

国内网络版：

```txt
请执行：git clone https://github.com/boundlessocean1/codex-adversarial-qa-skills.git /tmp/codex-adversarial-qa-skills && cd /tmp/codex-adversarial-qa-skills && NPM_REGISTRY=https://registry.npmmirror.com npm run install:skills && npm run doctor
```

## 安装检查

```bash
npm run doctor
```

如果输出能看到两个 Skill，说明安装成功。

## 怎么用

### 1. 测 Web / H5 页面

先启动你的前端项目，例如：

```bash
npm run dev
```

然后在 Codex 里说：

```txt
$codex-ui-adversarial-playwright 测试 http://localhost:3000，只总结高危和中危问题，保存完整报告，不要把完整日志贴到聊天里。
```

更完整的提示词：

```txt
$codex-ui-adversarial-playwright 测试 http://localhost:3000，重点检查移动端布局、按钮遮挡、控制台错误、无障碍问题、异常输入、快速点击和网络异常，并输出报告。不要点击删除、支付、发送、邀请、上传等危险操作。
```

也可以命令行运行：

```bash
cd ~/.agents/skills/codex-ui-adversarial-playwright
node scripts/run-audit.js --url http://localhost:3000
```

报告默认输出到：

```txt
.codex/ui-audit/<timestamp>/
```

### 2. 测微信小程序

在 Codex 里说：

```txt
$codex-miniprogram-adversarial-skill 测试 /Users/hy/path/to/miniprogram，自动发现 app.json 页面，检查 UI 布局、safe-area、按钮点击区域、异常输入、快速点击、控制台错误、运行时异常，并输出报告。不要执行删除、支付、提交、发送、上传、邀请等危险操作。
```

也可以命令行运行：

```bash
cd ~/.agents/skills/codex-miniprogram-adversarial-skill
node scripts/run-audit.js --project /Users/hy/path/to/miniprogram
```

如果微信开发者工具 CLI 没有自动识别，可以指定路径：

```bash
node scripts/run-audit.js \
  --project /Users/hy/path/to/miniprogram \
  --cli-path /Applications/wechatwebdevtools.app/Contents/MacOS/cli
```

报告默认输出到：

```txt
.codex/miniprogram-audit/<timestamp>/
```

## 环境要求

### 通用

```txt
Node.js >= 18
npm 可用
Codex 可以读取 ~/.agents/skills
```

### Web 项目

Web Skill 可以直接用来探索页面。

如果要把问题生成正式 Playwright Test 用例，并运行测试，建议在你的 Web 项目里安装：

```bash
npm install -D @playwright/test
npx playwright install
```

不推荐只依赖全局 Playwright。

### 微信小程序项目

需要本机安装微信开发者工具。

小程序项目需要包含：

```txt
project.config.json
app.json
```

并且项目本身能在微信开发者工具里正常打开和编译。

macOS 常见微信开发者工具 CLI 路径：

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli
```

## 推荐工作流

### Web

```txt
1. 用 Web Skill 先找 UI 问题
2. 查看 report.md 和截图
3. 让 Codex 把确认的问题生成 Playwright Test 用例
4. 修复问题
5. 执行 npx playwright test 验证
```

### 微信小程序

```txt
1. 用小程序 Skill 扫 app.json 里的页面
2. 查看报告、截图、异常和页面栈
3. 修复问题
4. 再跑 run-audit.js 验证
```

## 常见问题

### 1. npm 一直卡住

换国内源：

```bash
NPM_REGISTRY=https://registry.npmmirror.com npm run install:skills
```

### 2. npm 报 EACCES / permission denied

通常是 npm 缓存权限坏了，执行：

```bash
sudo chown -R "$(id -u)":"$(id -g)" "$(npm config get cache)"
npm cache clean --force
npm run install:skills
```

### 3. Codex 看不到 Skill

检查目录：

```bash
ls ~/.agents/skills
```

应该看到：

```txt
codex-ui-adversarial-playwright
codex-miniprogram-adversarial-skill
```

然后重启 Codex。

### 4. 小程序项目需要安装 miniprogram-automator 吗？

通常不需要。这个 Skill 自己会安装依赖。

但小程序项目自己的依赖仍然要正常安装，例如：

```bash
npm install
```

### 5. Web 项目需要安装 @playwright/test 吗？

只做探索式测试时不一定需要。

如果要生成并运行正式测试用例，建议项目里安装：

```bash
npm install -D @playwright/test
npx playwright install
```

## 卸载

```bash
npm run uninstall:skills
```

## 目录结构

```txt
codex-adversarial-qa-skills/
  README.md
  package.json
  scripts/
  skills/
    codex-ui-adversarial-playwright/
    codex-miniprogram-adversarial-skill/
```

## 安全说明

默认不要让自动化测试点击这些操作：

```txt
删除
支付
发送
邀请
上传
提交真实订单
修改生产数据
```

建议使用测试环境和测试账号。

## License

MIT
