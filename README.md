# Codex Adversarial QA Skills

> 一键安装给 Codex 用的前端 Web + 微信小程序 UI 对抗性测试 Skills。

| Skill                                 | 场景                                               | 底层能力                                                     |
| ------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| `codex-ui-adversarial-playwright`     | Web / H5 / 管理后台 / React / Vue / Next.js / Vite | Playwright + axe-core + 截图 + console/network 捕获          |
| `codex-miniprogram-adversarial-skill` | 微信小程序原生页面                                 | miniprogram-automator + 微信开发者工具 CLI + 页面栈/截图/权限/网络 mock |

---

## 适合做什么

### Web / H5

```txt
移动端布局检查
按钮遮挡检查
控制台错误检查
pageerror 检查
请求失败检查
无障碍扫描
异常输入 fuzz
快速点击 rapid click
网络异常模拟
截图报告
Playwright Test 用例生成
```

### 微信小程序

```txt
自动发现 app.json 页面
reLaunch / switchTab 巡检
页面栈检查
systemInfo 检查
模拟器截图
console / exception 捕获
按钮点击区域检查
safe-area 检查
input / textarea fuzz
快速 tap
wx.request 失败 mock
授权拒绝 mock
截图基线更新和对比
小程序回归测试模板生成
```

---

## 依赖要求

### 通用要求

```bash
node -v
npm -v
```

要求：

```txt
Node.js >= 18
npm 可用
Codex 能读取 ~/.agents/skills
```

### Web Skill 额外要求

Web Skill 自己会安装：

```txt
playwright
@axe-core/playwright
Playwright Chromium
```

如果你要把发现的问题沉淀成正式 Playwright Test 用例，你的 Web 项目里还应该安装：

```bash
npm install -D @playwright/test
npx playwright install
```

> 注意：`@playwright/test` 应该装在具体 Web 项目里，不建议只依赖全局安装。

### 小程序 Skill 额外要求

你的电脑需要安装：

```txt
微信开发者工具
微信开发者工具 CLI
```

macOS 常见路径：

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli
```

小程序项目需要至少包含：

```txt
project.config.json
app.json
```

并且项目本身能在微信开发者工具里正常打开和编译。

---

## 一键安装

### 方式一：克隆后安装，推荐

```bash
git clone https://github.com/boundlessocean1/codex-adversarial-qa-skills/codex-adversarial-qa-skills.git
cd codex-adversarial-qa-skills
npm run install:skills
```

国内网络慢时：

```bash
NPM_REGISTRY=https://registry.npmmirror.com npm run install:skills
```

安装完成后，两个 Skill 会复制到：

```txt
~/.agents/skills/
  codex-ui-adversarial-playwright/
  codex-miniprogram-adversarial-skill/
```

如果 Codex 没立刻显示，重启 Codex。

### 方式二：本地脚本安装

```bash
bash scripts/install.sh
```

指定 npm registry：

```bash
bash scripts/install.sh --registry https://registry.npmmirror.com
```

跳过依赖安装，只复制 Skill：

```bash
bash scripts/install.sh --skip-deps
```

跳过 Playwright 浏览器下载：

```bash
bash scripts/install.sh --skip-browsers
```

### 方式三：远程一行安装

```bash
curl -fsSL https://raw.githubusercontent.com/boundlessocean1/codex-adversarial-qa-skills/codex-adversarial-qa-skills/main/scripts/install.sh \
  | bash -s -- --repo https://github.com/boundlessocean1/codex-adversarial-qa-skills/codex-adversarial-qa-skills.git
```

如果你用的是国内 registry：

```bash
curl -fsSL https://raw.githubusercontent.com/boundlessocean1/codex-adversarial-qa-skills/codex-adversarial-qa-skills/main/scripts/install.sh \
  | bash -s -- \
    --repo https://github.com/boundlessocean1/codex-adversarial-qa-skills/codex-adversarial-qa-skills.git \
    --registry https://registry.npmmirror.com
```

### Windows PowerShell

```powershell
npm run install:skills
```

或者：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install.ps1
```

---

## 安装检查

```bash
npm run doctor
```

或者：

```bash
node scripts/doctor.js
```

---

## 使用方式

### Web / H5 项目

先启动你的项目，例如：

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

命令行直接运行：

```bash
cd ~/.agents/skills/codex-ui-adversarial-playwright
node scripts/run-audit.js --url http://localhost:3000
```

增强模式：

```bash
node scripts/run-audit.js \
  --url http://localhost:3000 \
  --fuzz \
  --network-chaos
```

报告默认输出：

```txt
.codex/ui-audit/<timestamp>/
  report.md
  report.json
  screenshots/
```

### 微信小程序项目

在 Codex 里说：

```txt
$codex-miniprogram-adversarial-skill 测试 /Users/hy/path/to/miniprogram，自动发现 app.json 页面，检查 UI 布局、safe-area、按钮点击区域、异常输入、快速点击、控制台错误、运行时异常，并输出报告。不要执行删除、支付、提交、发送、上传、邀请等危险操作。
```

命令行检查环境：

```bash
cd ~/.agents/skills/codex-miniprogram-adversarial-skill
node scripts/doctor.js --project /Users/hy/path/to/miniprogram
```

如果 CLI 未自动识别：

```bash
node scripts/doctor.js \
  --project /Users/hy/path/to/miniprogram \
  --cli-path /Applications/wechatwebdevtools.app/Contents/MacOS/cli
```

运行审计：

```bash
node scripts/run-audit.js --project /Users/hy/path/to/miniprogram
```

增强模式：

```bash
node scripts/run-audit.js \
  --project /Users/hy/path/to/miniprogram \
  --routes all \
  --max-routes 20 \
  --fuzz \
  --rapid-tap \
  --network-chaos \
  --permission-chaos
```

报告默认输出：

```txt
.codex/miniprogram-audit/<timestamp>/
  report.md
  report.json
  screenshots/
  snapshot-diff/
```

---

## 推荐工作流

### Web

```txt
1. 让 Codex 用 Web Skill 探索页面
2. 查看 report.md 和截图
3. 让 Codex 把确认的问题生成 Playwright Test 用例
4. 你修 bug
5. 执行 npx playwright test 验证
```

### 小程序

```txt
1. 让 Codex 用 Mini Program Skill 扫 app.json 页面
2. 查看报告、截图、异常和页面栈
3. 让 Codex 把高价值问题生成 Node 回归测试脚本
4. 你修 bug
5. 再跑 run-audit.js 或生成的回归脚本验证
```

---

## 卸载

```bash
npm run uninstall:skills
```

或者：

```bash
node scripts/uninstall.js
```

---

## 常见问题

### 1. npm 一直卡住

可以指定 registry：

```bash
NPM_REGISTRY=https://registry.npmmirror.com npm run install:skills
```

或者：

```bash
node scripts/install.js --registry https://registry.npmmirror.com
```

### 2. npm 报 EACCES / permission denied

通常是以前用过 `sudo npm install`，导致 npm 缓存权限坏了。修复：

```bash
sudo chown -R "$(id -u)":"$(id -g)" "$(npm config get cache)"
npm cache clean --force
npm run install:skills
```

### 3. Codex 没看到 Skill

检查目录：

```bash
ls ~/.agents/skills
```

应该看到：

```txt
codex-ui-adversarial-playwright
codex-miniprogram-adversarial-skill
```

然后重启 Codex，或在 Codex 里执行 `/skills`。

### 4. Web Skill 要不要全局安装 Playwright？

一般不需要。Skill 自己会安装它需要的 `playwright`。如果你要跑正式 Playwright Test，用项目内依赖：

```bash
npm install -D @playwright/test
npx playwright install
```

### 5. 小程序项目要不要安装 miniprogram-automator？

通常不需要。这个 Skill 自己依赖 `miniprogram-automator`。但你的小程序项目自身依赖仍然要正常安装和构建。

### 6. 小程序 Skill 能不能测试 H5 web-view？

小程序原生页面用 Mini Program Skill。`web-view` 里的 H5 页面建议单独用 Web Skill 测对应的 H5 URL。

---

## 目录结构

```txt
codex-adversarial-qa-skills/
  README.md
  LICENSE
  package.json
  scripts/
    install.js
    install.sh
    install.ps1
    uninstall.js
    doctor.js
    check.js
    pack.js
  skills/
    codex-ui-adversarial-playwright/
      SKILL.md
      scripts/
      lib/
      templates/
      references/
      agents/openai.yaml
    codex-miniprogram-adversarial-skill/
      SKILL.md
      scripts/
      lib/
      templates/
      references/
      agents/openai.yaml
```

---

## 开发者命令

检查语法和 Skill frontmatter：

```bash
npm run check
```

打包 zip：

```bash
npm run pack:zip
```

---

## 安全约定

默认测试原则：

```txt
不点击删除
不点击支付
不点击发送
不点击邀请
不点击上传
不提交真实订单
不修改真实生产数据
```

如果你测试的是生产环境，请只使用只读页面或测试账号。

---

## License

MIT
