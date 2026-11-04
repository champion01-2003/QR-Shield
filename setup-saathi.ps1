$ErrorActionPreference = "Stop"

$backendDirectory = Join-Path $PSScriptRoot "qr-shield-starter\backend"
$configPath = Join-Path $backendDirectory ".env"
$endpoint = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
$model = "gemini-3.8-flash"

if (-not (Test-Path $backendDirectory)) {
    throw "QR-Shield backend was not found at $backendDirectory."
}

Write-Host "Saathi hosted AI setup (Google Gemini)"
Write-Host "Create a Gemini API key at https://aistudio.google.com/apikey"
Write-Host "The key is entered locally, is not displayed, and is not sent to this chat."
$secureKey = Read-Host "Paste your Gemini API key" -AsSecureString
$keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)

try {
    $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
    if ([string]::IsNullOrWhiteSpace($apiKey)) {
        throw "An API key is required. Nothing was saved."
    }

    $body = @{
        model = $model
        messages = @(@{ role = "user"; content = "Reply with the single word READY." })
        max_tokens = 10
        stream = $false
    } | ConvertTo-Json -Depth 5 -Compress

    try {
        $testResponse = Invoke-RestMethod `
            -Uri $endpoint `
            -Method Post `
            -ContentType "application/json" `
            -Headers @{ Authorization = "Bearer $apiKey" } `
            -Body $body `
            -TimeoutSec 45
    }
    catch {
        $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { "network" }
        throw "Gemini connection test failed ($status). Check the key, account/model access, and internet connection. No configuration was saved."
    }

    if (-not $testResponse.choices -or -not $testResponse.choices[0].message.content) {
        throw "Gemini did not return a chat reply. No configuration was saved."
    }

    $preservedLines = @()
    if (Test-Path $configPath) {
        $preservedLines = @(Get-Content $configPath | Where-Object {
            $_ -notmatch '^\s*(QRSHIELD_CHAT_API_URL|QRSHIELD_CHAT_MODEL|QRSHIELD_CHAT_API_KEY)\s*='
        })
    }
    $newLines = @(
        "QRSHIELD_CHAT_API_URL=$endpoint"
        "QRSHIELD_CHAT_MODEL=$model"
        "QRSHIELD_CHAT_API_KEY=$apiKey"
    )
    $configLines = @($preservedLines + $newLines) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    [System.IO.File]::WriteAllLines($configPath, $configLines, [System.Text.UTF8Encoding]::new($false))

    Write-Host "Gemini replied successfully. The key is saved in the backend's ignored .env file."
    Write-Host "Keep the backend running; reopen Saathi or wait for its health check to refresh."
    Write-Host "If the backend is stopped, start QR-Shield with: npm run dev:full"
}
finally {
    if ($null -ne $keyPointer -and $keyPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
    }
    $apiKey = $null
    $secureKey = $null
}
