$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
if (!(Test-Path -LiteralPath $nodePath)) { throw 'Install Node.js 22 or newer, then run start.cmd again.' }
if (!$env:OPENAI_API_KEY) {
  $env:OPENAI_API_KEY = [Environment]::GetEnvironmentVariable('OPENAI_API_KEY','User')
  if (!$env:OPENAI_API_KEY) { $env:OPENAI_API_KEY = [Environment]::GetEnvironmentVariable('OPENAI_API_KEY','Machine') }
}
$portNumber = if ($env:PORT) { $env:PORT } else { '3210' }
$siteUrl = 'http://127.0.0.1:' + $portNumber
try {
  $health = Invoke-RestMethod -Uri ($siteUrl + '/api/bootstrap') -TimeoutSec 2
  if ($health.dataDir -eq (Join-Path $PSScriptRoot 'local-data')) { Start-Process $siteUrl; exit 0 }
  throw 'Port is used by another application.'
} catch {
  if ($_.Exception.Message -eq 'Port is used by another application.') { throw }
}
$logDir = Join-Path $PSScriptRoot 'local-data'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$process = Start-Process -FilePath $nodePath -ArgumentList 'server.mjs' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'server.log') -RedirectStandardError (Join-Path $logDir 'server-error.log') -PassThru
for ($attempt=0; $attempt -lt 30; $attempt++) {
  Start-Sleep -Milliseconds 300
  if ($process.HasExited) { throw 'Startup failed. Check local-data/server-error.log.' }
  try { $health = Invoke-RestMethod -Uri ($siteUrl + '/api/bootstrap') -TimeoutSec 1; break } catch {}
}
if (!$health) { throw 'Server did not start in time.' }
Start-Process $siteUrl
Write-Host ('Mojian is running at ' + $siteUrl)
