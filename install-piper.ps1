# =========================================
# Install Piper TTS for Windows
# =========================================
# This script downloads and installs Piper TTS executable
# and the required voice models for text-to-speech synthesis

Write-Host "Installing Piper TTS..." -ForegroundColor Cyan
Write-Host ""

# Create directory
$piperDir = "C:\piper"
if (-not (Test-Path $piperDir)) {
    New-Item -ItemType Directory -Path $piperDir -Force | Out-Null
    Write-Host "[OK] Created directory: $piperDir" -ForegroundColor Green
} else {
    Write-Host "[OK] Directory already exists: $piperDir" -ForegroundColor Yellow
}

# Create voices subdirectory
$voicesDir = "$piperDir\voices"
if (-not (Test-Path $voicesDir)) {
    New-Item -ItemType Directory -Path $voicesDir -Force | Out-Null
    Write-Host "[OK] Created voices directory: $voicesDir" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Step 1: Download Piper Executable" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Download Piper executable (Windows amd64 build)
$piperZipUrl = "https://github.com/rhasspy/piper/releases/download/v1.2.0/piper_windows_amd64.zip"
$piperZipPath = "$piperDir\piper.zip"
$piperExePath = "$piperDir\piper.exe"

if (Test-Path $piperExePath) {
    Write-Host "[SKIP] Piper executable already exists: $piperExePath" -ForegroundColor Yellow
} else {
    Write-Host "Downloading Piper from: $piperZipUrl" -ForegroundColor White
    try {
        Invoke-WebRequest -Uri $piperZipUrl -OutFile $piperZipPath -UseBasicParsing
        Write-Host "[OK] Downloaded Piper zip" -ForegroundColor Green
        
        # Extract
        Write-Host "Extracting Piper..." -ForegroundColor White
        Expand-Archive -Path $piperZipPath -DestinationPath $piperDir -Force
        
        # Move files from subdirectory to main directory
        $extractedDir = "$piperDir\piper"
        if (Test-Path $extractedDir) {
            Get-ChildItem -Path $extractedDir | Move-Item -Destination $piperDir -Force
            Remove-Item -Path $extractedDir -Recurse -Force
        }
        
        # Cleanup zip
        Remove-Item -Path $piperZipPath -Force
        
        if (Test-Path $piperExePath) {
            Write-Host "[OK] Piper installed successfully!" -ForegroundColor Green
            Write-Host "    Location: $piperExePath" -ForegroundColor Gray
        } else {
            Write-Host "[ERROR] Piper executable not found after extraction!" -ForegroundColor Red
            exit 1
        }
    } catch {
        Write-Host "[ERROR] Failed to download/extract Piper: $_" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Step 2: Download Voice Models" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Voice models to download
$voices = @(
    @{
        Name = "Amy (US Female)"
        Model = "en_US-amy-medium"
        OnnxUrl = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/amy/medium/en_US-amy-medium.onnx"
        JsonUrl = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/amy/medium/en_US-amy-medium.onnx.json"
    },
    @{
        Name = "Ryan (US Male)"
        Model = "en_US-ryan-high"
        OnnxUrl = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/ryan/high/en_US-ryan-high.onnx"
        JsonUrl = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/ryan/high/en_US-ryan-high.onnx.json"
    },
    @{
        Name = "Alba (UK Female)"
        Model = "en_GB-alba-medium"
        OnnxUrl = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_GB/alba/medium/en_GB-alba-medium.onnx"
        JsonUrl = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_GB/alba/medium/en_GB-alba-medium.onnx.json"
    },
    @{
        Name = "Northern English Male (UK)"
        Model = "en_GB-northern_english_male-medium"
        OnnxUrl = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_GB/northern_english_male/medium/en_GB-northern_english_male-medium.onnx"
        JsonUrl = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_GB/northern_english_male/medium/en_GB-northern_english_male-medium.onnx.json"
    }
)

$totalDownloaded = 0

foreach ($voice in $voices) {
    Write-Host "Downloading: $($voice.Name)..." -ForegroundColor White
    
    $onnxPath = "$voicesDir\$($voice.Model).onnx"
    $jsonPath = "$voicesDir\$($voice.Model).onnx.json"
    
    # Download .onnx file
    if (Test-Path $onnxPath) {
        Write-Host "  [SKIP] Model already exists: $($voice.Model).onnx" -ForegroundColor Yellow
    } else {
        try {
            Invoke-WebRequest -Uri $voice.OnnxUrl -OutFile $onnxPath -UseBasicParsing
            $sizeBytes = (Get-Item $onnxPath).Length
            $sizeMB = [math]::Round($sizeBytes / 1MB, 2)
            Write-Host "  [OK] Downloaded model: $($voice.Model).onnx ($sizeMB MB)" -ForegroundColor Green
            $totalDownloaded += $sizeBytes
        } catch {
            Write-Host "  [ERROR] Failed to download .onnx: $_" -ForegroundColor Red
        }
    }
    
    # Download .json config
    if (Test-Path $jsonPath) {
        Write-Host "  [SKIP] Config already exists: $($voice.Model).onnx.json" -ForegroundColor Yellow
    } else {
        try {
            Invoke-WebRequest -Uri $voice.JsonUrl -OutFile $jsonPath -UseBasicParsing
            Write-Host "  [OK] Downloaded config: $($voice.Model).onnx.json" -ForegroundColor Green
        } catch {
            Write-Host "  [ERROR] Failed to download .json: $_" -ForegroundColor Red
        }
    }
    
    Write-Host ""
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Installation Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Piper TTS installed at: $piperExePath" -ForegroundColor White
Write-Host "Voice models installed at: $voicesDir" -ForegroundColor White

if ($totalDownloaded -gt 0) {
    $totalMB = [math]::Round($totalDownloaded / 1MB, 2)
    Write-Host "Total downloaded: $totalMB MB" -ForegroundColor Gray
}

Write-Host ""
Write-Host "You can now use Piper TTS for voice generation!" -ForegroundColor Green
Write-Host ""

# Test Piper
Write-Host "Testing Piper installation..." -ForegroundColor Cyan
try {
    & $piperExePath --version 2>&1 | Out-Null
    Write-Host "[OK] Piper is working correctly!" -ForegroundColor Green
} catch {
    Write-Host "[WARNING] Could not verify Piper installation" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
