$ErrorActionPreference = "Stop"

$backendDirectory = Join-Path $PSScriptRoot "qr-shield-starter\backend"
$frontendDirectory = Join-Path $PSScriptRoot "qr-shield-starter\frontend"
$pythonPath = Join-Path $backendDirectory ".venv\Scripts\python.exe"
$portRange = 8000..8010

if (-not (Test-Path $pythonPath)) {
    throw "Backend Python environment not found. Install backend requirements in $backendDirectory first."
}
if (-not (Test-Path (Join-Path $frontendDirectory "node_modules"))) {
    throw "Frontend dependencies not found. Run npm install in $frontendDirectory first."
}

$chatConfigPath = Join-Path $backendDirectory ".env"
$ollamaCommand = Get-Command "ollama" -ErrorAction SilentlyContinue
if (-not $ollamaCommand) {
    $installedOllama = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
    if (Test-Path $installedOllama) {
        $ollamaPath = $installedOllama
    }
}
else {
    $ollamaPath = $ollamaCommand.Source
}
if (-not (Test-Path $chatConfigPath) -and -not $env:QRSHIELD_CHAT_API_URL -and -not $env:QRSHIELD_CHAT_MODEL -and $ollamaPath) {
    $env:QRSHIELD_CHAT_API_URL = "http://127.0.0.1:11434/v1/chat/completions"
    $env:QRSHIELD_CHAT_MODEL = "qwen2.5:0.5b"
    $serviceReady = $false

    try {
        $null = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 1
        $serviceReady = $true
    }
    catch {
        Start-Process -FilePath $ollamaPath -ArgumentList "serve" -WindowStyle Hidden
        $serviceReady = $false
        for ($attempt = 0; $attempt -lt 20; $attempt++) {
            Start-Sleep -Seconds 1
            try {
                $null = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 1
                $serviceReady = $true
                break
            }
            catch {
                continue
            }
        }
        if (-not $serviceReady) {
            Write-Warning "Ollama did not start. Saathi will show its local AI service as unavailable."
        }
    }

    if ($serviceReady) {
        try {
            $installedModels = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 2
            $modelInstalled = $installedModels.models | Where-Object { $_.name -in @("qwen2.5:0.5b", "qwen2.5:0.5b-instruct", "qwen2.5:0.5b-instruct-q4_K_M") }
            if (-not $modelInstalled) {
                Write-Host "Downloading the local Saathi model. The first run may take several minutes."
                & $ollamaPath pull "qwen2.5:0.5b"
                if ($LASTEXITCODE -ne 0) {
                    Write-Warning "The local model could not be downloaded. Saathi will report that setup is incomplete."
                }
            }
        }
        catch {
            Write-Warning "Could not check or download the local Saathi model: $($_.Exception.Message)"
        }
    }
}

$apiPort = $null
foreach ($candidatePort in $portRange) {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $candidatePort)
    try {
        $listener.Start()
        $apiPort = $candidatePort
        break
    }
    catch [System.Net.Sockets.SocketException] {
        continue
    }
    finally {
        $listener.Stop()
    }
}

if ($null -eq $apiPort) {
    throw "No available QR-Shield API port found between 8000 and 8010."
}

$backendCommand = "Set-Location -LiteralPath '$backendDirectory'; & '$pythonPath' -m uvicorn main:app --reload --host 127.0.0.1 --port $apiPort"
$backendArguments = "-NoProfile -NoExit -Command `"$backendCommand`""
Start-Process -FilePath "powershell.exe" -ArgumentList $backendArguments -WorkingDirectory $backendDirectory

$env:QRSHIELD_API_TARGET = "http://127.0.0.1:$apiPort"
$frontendCommand = "Set-Location -LiteralPath '$frontendDirectory'; npm.cmd run dev -- --host 127.0.0.1"
$frontendArguments = "-NoProfile -NoExit -Command `"$frontendCommand`""
Start-Process -FilePath "powershell.exe" -ArgumentList $frontendArguments -WorkingDirectory $frontendDirectory

Write-Host "QR-Shield API starting at http://127.0.0.1:$apiPort"
Write-Host "Frontend starting in the second PowerShell window."
Write-Host "Keep both service windows open while using the site."
