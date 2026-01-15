/**
 * FFmpeg Installation Verification
 * Checks if FFmpeg is installed and provides helpful error messages
 */

import { execSync } from 'child_process';

let ffmpegVerified = false;
let ffmpegVersion = '';

/**
 * Verify FFmpeg is installed and accessible
 */
export function verifyFFmpeg(): { installed: boolean; version: string; error?: string } {
  if (ffmpegVerified) {
    return { installed: true, version: ffmpegVersion };
  }

  try {
    const output = execSync('ffmpeg -version', { encoding: 'utf-8', timeout: 5000 });
    const versionMatch = output.match(/ffmpeg version ([^\s]+)/);
    ffmpegVersion = versionMatch ? versionMatch[1] : 'unknown';
    ffmpegVerified = true;
    
    console.log(`[FFmpegCheck] ✓ FFmpeg is installed: ${ffmpegVersion}`);
    return { installed: true, version: ffmpegVersion };
  } catch (error: any) {
    const errorMessage = error.code === 'ENOENT' 
      ? 'FFmpeg is not installed or not in PATH'
      : error.message;
    
    console.error(`[FFmpegCheck] ✗ FFmpeg verification failed: ${errorMessage}`);
    console.error('[FFmpegCheck] Please ensure FFmpeg is installed:');
    console.error('[FFmpegCheck] - Debian/Ubuntu: apt-get install ffmpeg');
    console.error('[FFmpegCheck] - macOS: brew install ffmpeg');
    console.error('[FFmpegCheck] - Windows: Download from https://ffmpeg.org/download.html');
    
    return { installed: false, version: '', error: errorMessage };
  }
}

/**
 * Get FFmpeg capabilities
 */
export function getFFmpegCapabilities(): { hasH264: boolean; hasAAC: boolean } {
  try {
    const output = execSync('ffmpeg -codecs', { encoding: 'utf-8', timeout: 5000 });
    
    return {
      hasH264: output.includes('libx264') || output.includes('h264'),
      hasAAC: output.includes('aac'),
    };
  } catch {
    return { hasH264: false, hasAAC: false };
  }
}
