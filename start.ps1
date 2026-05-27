$serverDir = Join-Path $PSScriptRoot "server"
$clientDir = Join-Path $PSScriptRoot "client"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Movie Center - Starting" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/2] Starting server..." -ForegroundColor Yellow
Start-Process -FilePath "cmd" -ArgumentList "/k cd /d `"$serverDir`" && npm run dev" -WindowStyle Minimized

Start-Sleep -Seconds 3

Write-Host "[2/2] Starting client..." -ForegroundColor Yellow
Start-Process -FilePath "cmd" -ArgumentList "/k cd /d `"$clientDir`" && npm run dev" -WindowStyle Minimized

Write-Host ""
Write-Host "Waiting for services..." -ForegroundColor Gray
Start-Sleep -Seconds 8
Start-Process "http://localhost:5173"

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Done!" -ForegroundColor Green
Write-Host "  Client: http://localhost:5173" -ForegroundColor Green
Write-Host "  Server: http://localhost:3001" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Start-Sleep -Seconds 3
