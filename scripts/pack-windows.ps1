$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$stage = Join-Path $root 'release\Korpus'
$zip = Join-Path $root 'release\Korpus-windows.zip'

if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path (Join-Path $stage 'server\dist') | Out-Null

Push-Location $root
npm run build -w client
$esbuild = Join-Path $root 'node_modules\.bin\esbuild.cmd'
if (-not (Test-Path $esbuild)) { throw 'esbuild not found' }
$bundle = Join-Path $stage 'server\dist\index.mjs'
$shared = Join-Path $root 'shared\src\index.ts'
& $esbuild (Join-Path $root 'server\src\index.ts') --bundle --platform=node --format=esm --packages=external "--alias:@planner/shared=$shared" --outfile=$bundle
if ($LASTEXITCODE -ne 0) { throw "esbuild failed with exit $LASTEXITCODE" }
Pop-Location

Copy-Item (Join-Path $root 'server\sql') (Join-Path $stage 'server\sql') -Recurse
Copy-Item (Join-Path $root 'server\assets') (Join-Path $stage 'server\assets') -Recurse
Copy-Item (Join-Path $root 'client\dist') (Join-Path $stage 'client\dist') -Recurse
Copy-Item (Join-Path $PSScriptRoot 'windows\package.json') (Join-Path $stage 'package.json')
Copy-Item (Join-Path $PSScriptRoot 'windows\Korpus.bat') (Join-Path $stage 'Korpus.bat')
Copy-Item (Join-Path $PSScriptRoot 'windows\README.txt') (Join-Path $stage 'README.txt')

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

if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip
Write-Output "zip=$zip"
Write-Output "bytes=$((Get-Item $zip).Length)"
