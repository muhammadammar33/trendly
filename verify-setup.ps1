# System Verification Script for Trendly Video Generator

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "System Verification" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

$allGood = $true

# 1. Check Piper
Write-Host "[1/4] Checking Piper TTS..." -ForegroundColor White
if (Test-Path "C:\piper\piper.exe") {
    $version = & "C:\piper\piper.exe" --version 2>&1
    Write-Host "  ✓ Piper installed: v$version" -ForegroundColor Green
} else {
    Write-Host "  ✗ Piper NOT found at C:\piper\piper.exe" -ForegroundColor Red
    $allGood = $false
}

# 2. Check Voice Models
Write-Host "[2/4] Checking Voice Models..." -ForegroundColor White
$models = @('en_US-amy-medium.onnx', 'en_US-ryan-high.onnx', 'en_GB-alba-medium.onnx', 'en_GB-northern_english_male-medium.onnx')
$foundModels = 0
foreach ($model in $models) {
    if (Test-Path "C:\piper\voices\$model") {
        $foundModels++
    }
}
if ($foundModels -eq 4) {
    Write-Host "  ✓ All 4 voice models found" -ForegroundColor Green
} else {
    Write-Host "  ✗ Only $foundModels/4 voice models found" -ForegroundColor Red
    $allGood = $false
}

# 3. Check FFmpeg
Write-Host "[3/4] Checking FFmpeg..." -ForegroundColor White
$ffmpegCheck = Get-Command ffmpeg -ErrorAction SilentlyContinue
if ($ffmpegCheck) {
    Write-Host "  ✓ FFmpeg installed" -ForegroundColor Green
} else {
    Write-Host "  ✗ FFmpeg NOT found" -ForegroundColor Red
    $allGood = $false
}

# 4. Check Environment
Write-Host "[4/4] Checking Environment Variables..." -ForegroundColor White
if (Test-Path ".env") {
    $envContent = Get-Content ".env" -Raw
    
    $hasGroq = $envContent -match "GROQ_API_KEY="
    $hasPiperPath = $envContent -match "PIPER_PATH="
    $hasVoicesDir = $envContent -match "PIPER_VOICES_DIR="
    
    if ($hasGroq) {
        Write-Host "  ✓ GROQ_API_KEY configured" -ForegroundColor Green
    } else {
        Write-Host "  ✗ GROQ_API_KEY missing" -ForegroundColor Yellow
    }
    
    if ($hasPiperPath) {
        Write-Host "  ✓ PIPER_PATH configured" -ForegroundColor Green
    } else {
        Write-Host "  ! PIPER_PATH missing (will use default)" -ForegroundColor Yellow
    }
    
    if ($hasVoicesDir) {
        Write-Host "  ✓ PIPER_VOICES_DIR configured" -ForegroundColor Green
    } else {
        Write-Host "  ! PIPER_VOICES_DIR missing (will use default)" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ✗ .env file not found" -ForegroundColor Red
    $allGood = $false
}

Write-Host ""
Write-Host "==================================" -ForegroundColor Cyan

if ($allGood) {
    Write-Host "✓ All Systems Ready!" -ForegroundColor Green
    Write-Host ""
    Write-Host "You can now:" -ForegroundColor White
    Write-Host "  1. Generate voiceovers with Piper TTS" -ForegroundColor Gray
    Write-Host "  2. Render videos with FFmpeg" -ForegroundColor Gray
    Write-Host "  3. Use AI script generation with Groq" -ForegroundColor Gray
} else {
    Write-Host "✗ Some components are missing" -ForegroundColor Red
    Write-Host "Please install missing components before proceeding" -ForegroundColor Yellow
}

Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""
