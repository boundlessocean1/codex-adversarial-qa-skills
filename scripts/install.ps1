param(
  [string]$Target = "$HOME/.agents/skills",
  [string]$Registry = "https://registry.npmjs.org/",
  [switch]$SkipDeps,
  [switch]$SkipBrowsers
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Resolve-Path (Join-Path $ScriptDir "..")
$argsList = @("--target", $Target, "--registry", $Registry)
if ($SkipDeps) { $argsList += "--skip-deps" }
if ($SkipBrowsers) { $argsList += "--skip-browsers" }
node (Join-Path $RootDir "scripts/install.js") @argsList
