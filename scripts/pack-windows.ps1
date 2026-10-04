$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$stage = Join-Path $root 'release\Korpus'
$zip = Join-Path $root 'release\Korpus-windows.zip'

if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null

Push-Location $root
npm run build -w client
$esbuild = Join-Path $root 'node_modules\esbuild\bin\esbuild.js'
if (-not (Test-Path $esbuild)) {
  $esbuild = Get-ChildItem -Path (Join-Path $root 'node_modules') -Filter esbuild.js -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match '\\esbuild\\bin\\esbuild\.js$' } |
    Select-Object -First 1 -ExpandProperty FullName
}
if (-not $esbuild) { throw 'esbuild не найден. Выполните npm install в корне проекта.' }
New-Item -ItemType Directory -Force -Path (Join-Path $stage 'server\dist') | Out-Null
node $esbuild (Join-Path $root 'server\src\index.ts') --bundle --platform=node --format=esm --packages=external --outfile=(Join-Path $stage 'server\dist\index.mjs')
Pop-Location

Copy-Item (Join-Path $root 'server\sql') (Join-Path $stage 'server\sql') -Recurse
Copy-Item (Join-Path $root 'server\assets') (Join-Path $stage 'server\assets') -Recurse
Copy-Item (Join-Path $root 'client\dist') (Join-Path $stage 'client\dist') -Recurse

@'
{
  "name": "korpus",
  "private": true,
  "dependencies": {
    "@electric-sql/pglite": "0.3.16",
    "@fastify/cors": "11.3.0",
    "@fastify/static": "8.3.0",
    "fastify": "5.12.5",
    "pdfkit": "0.17.2",
    "pg": "8.23.1"
  }
}
'@ | Set-Content -Encoding utf8 (Join-Path $stage 'package.json')

Push-Location $stage
npm install --omit=dev --no-package-lock
Pop-Location

$runtime = Join-Path $stage 'runtime'
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
$nodeZip = Join-Path $env:TEMP 'node-win-x64.zip'
if (-not (Test-Path $nodeZip) -or (Get-Item $nodeZip).Length -lt 1000000) {
  curl.exe -fsSL -o $nodeZip 'https://nodejs.org/dist/v24.14.0/node-v24.14.0-win-x64.zip'
}
$nodeUnpack = Join-Path $env:TEMP 'node-win-x64'
if (Test-Path $nodeUnpack) { Remove-Item $nodeUnpack -Recurse -Force }
Expand-Archive -Path $nodeZip -DestinationPath $nodeUnpack
Copy-Item (Join-Path $nodeUnpack 'node-v24.14.0-win-x64\node.exe') (Join-Path $runtime 'node.exe')

@'
@echo off
chcp 65001 >nul
cd /d "%~dp0"
set HOST=127.0.0.1
set PORT=3001
set OPEN_BROWSER=1
echo Планировщик запускается. Браузер откроется сам.
echo Это окно должно оставаться открытым. Закройте его, чтобы остановить программу.
"%~dp0runtime\node.exe" "%~dp0server\dist\index.mjs"
if errorlevel 1 pause
'@ | Set-Content -Encoding ascii (Join-Path $stage 'Korpus.bat')

@'
Корпус — планировщик корпусной мебели.

Запустите Korpus.bat. Откроется браузер.
Node, Docker и Postgres устанавливать не нужно.
Окно консоли оставьте открытым: это сервер программы.
'@ | Set-Content -Encoding utf8 (Join-Path $stage 'README.txt')

if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip
Write-Output "zip=$zip"
Write-Output "bytes=$((Get-Item $zip).Length)"
