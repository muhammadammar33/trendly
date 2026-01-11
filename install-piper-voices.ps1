# Piper Voice Models Downloader
# Run this script as Administrator to download all Piper voice models

Write-Host "Piper Voice Models Downloader" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# Create voices directory
$voicesDir = "C:\piper\voices"
Write-Host "Creating directory: $voicesDir" -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $voicesDir | Out-Null

# Base URL
$baseUrl = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en"

# Voice models to download
$voices = @(
    @{
        Name = "Amy (Female US - Medium)"
        Path = "en_US/amy/medium"
        Files = @("en_US-amy-medium.onnx", "en_US-amy-medium.onnx.json")
    },
    @{
        Name = "Ryan (Male US - High)"
        Path = "en_US/ryan/high"
        Files = @("en_US-ryan-high.onnx", "en_US-ryan-high.onnx.json")
    },
    @{
        Name = "Alba (Female UK - Medium)"
        Path = "en_GB/alba/medium"
        Files = @("en_GB-alba-medium.onnx", "en_GB-alba-medium.onnx.json")
    },
    @{
        Name = "Northern (Male UK - Medium)"
        Path = "en_GB/northern_english_male/medium"
        Files = @("en_GB-northern_english_male-medium.onnx", "en_GB-northern_english_male-medium.onnx.json")
    }
)

$totalFiles = ($voices | ForEach-Object { $_.Files.Count }) | Measure-Object -Sum
$currentFile = 0

foreach ($voice in $voices) {
    Write-Host ""
    Write-Host "Downloading: $($voice.Name)" -ForegroundColor Green
    
    foreach ($file in $voice.Files) {
        $currentFile++
        $url = "$baseUrl/$($voice.Path)/$file"
        $output = Join-Path $voicesDir $file
        
        # Check if file already exists
        if (Test-Path $output) {
            Write-Host "  Already exists: $file" -ForegroundColor Gray
            continue
        }
        
        Write-Host "  [$currentFile/$($totalFiles.Sum)] Downloading: $file" -ForegroundColor Cyan
        
        try {
            # Download with progress
            $ProgressPreference = 'SilentlyContinue'
            Invoke-WebRequest -Uri $url -OutFile $output -UseBasicParsing
            
            # Get file size
            $size = (Get-Item $output).Length / 1MB
            Write-Host "  Downloaded: $file ($([math]::Round($size, 2)) MB)" -ForegroundColor Green
        }
        catch {
            Write-Host "  Failed to download: $file" -ForegroundColor Red
            Write-Host "     Error: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Download Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Voice models location: $voicesDir" -ForegroundColor Yellow
Write-Host ""
Write-Host "Test Piper:" -ForegroundColor Yellow
Write-Host '   echo "Hello world" | C:\piper\piper.exe --model C:\piper\voices\en_US-amy-medium.onnx --output_file test.wav' -ForegroundColor Gray
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "   1. Restart your dev server: npm run dev" -ForegroundColor Gray
Write-Host "   2. Generate voiceover in Studio" -ForegroundColor Gray
Write-Host "   3. Enjoy natural voices!" -ForegroundColor Gray
Write-Host ""

# List downloaded files
$downloadedFiles = Get-ChildItem $voicesDir -Filter *.onnx -ErrorAction SilentlyContinue
if ($downloadedFiles.Count -gt 0) {
    Write-Host "Downloaded voice models:" -ForegroundColor Cyan
    foreach ($file in $downloadedFiles) {
        $size = $file.Length / 1MB
        Write-Host "   * $($file.Name) - $([math]::Round($size, 2)) MB" -ForegroundColor White
    }
}

Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
