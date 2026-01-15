/**
 * Video Renderer
 * 
 * Main FFmpeg rendering pipeline
 */

import { Project } from '../types';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import sharp from 'sharp';
import { fetch as undiciFetch } from 'undici';
import { buildInputList, calculateDuration, validateTimeline, normalizeTimeline, addEndScreen } from './timelineBuilder';
import { generateBannerFilter, generateQRFilter, generateEndScreenFilter } from './overlayRenderer';
import { generateTTS, buildAudioFilter } from './audioMixer';
import { generateQRCode } from './qrGenerator';
import { verifyFFmpeg } from '@/lib/ffmpegCheck';

/**
 * Sanitize text for FFmpeg drawtext filter
 * Escapes single quotes for use in text='' parameter
 */
function sanitizeFFmpegText(text: string): string {
  return text.replace(/'/g, "'\\\\\\\\''");
}

/**
 * Create an image with link icon and text using SVG
 * Renders Lucide link icon alongside the website URL
 */
async function createLinkIconImage(
  outputPath: string,
  text: string,
  textColor: string,
  fontSize: number = 48
): Promise<void> {
  // Parse the hex color to RGB
  const hex = textColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Lucide link icon SVG path (simplified)
  const iconSize = fontSize * 0.9;
  const iconPath = 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71';
  const iconPath2 = 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71';
  
  // Calculate text width (approximate)
  const charWidth = fontSize * 0.6;
  const textWidth = text.length * charWidth;
  const padding = 20;
  const iconSpacing = 15;
  const totalWidth = iconSize + iconSpacing + textWidth + padding * 2;
  const height = fontSize * 1.8;

  const svgText = `
    <svg width="${totalWidth}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(${padding}, ${height / 2 - iconSize / 2})">
        <path d="${iconPath}" stroke="rgb(${r},${g},${b})" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="${iconPath2}" stroke="rgb(${r},${g},${b})" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
      <text x="${padding + iconSize + iconSpacing}" y="${height / 2}" font-family="Arial" font-size="${fontSize}" fill="rgb(${r},${g},${b})" dominant-baseline="middle">${text}</text>
    </svg>
  `;

  await sharp(Buffer.from(svgText))
    .png()
    .toFile(outputPath);
}

/**
 * Render configuration
 */
export interface RenderConfig {
  project: Project;
  outputPath: string;
  resolution: '1080p' | '720p';
  onProgress?: (progress: number, stage: string) => void;
}

/**
 * Main video rendering function
 */
export async function renderVideo(config: RenderConfig): Promise<void> {
  const { project, outputPath, resolution, onProgress } = config;

  // Report progress
  const report = (progress: number, stage: string) => {
    console.log(`[VideoRenderer] ${stage} (${progress}%)`);
    onProgress?.(progress, stage);
  };

  const startTime = Date.now();
  console.log(`[VideoRenderer] ===== RENDER START (${resolution}) =====`);
  console.log(`[VideoRenderer] Project ID: ${project.projectId}`);
  console.log(`[VideoRenderer] Slides count: ${project.slides.length}`);

  // Verify FFmpeg installation
  const ffmpegCheck = verifyFFmpeg();
  if (!ffmpegCheck.installed) {
    throw new Error(`FFmpeg is not installed: ${ffmpegCheck.error}. Video rendering requires FFmpeg. Please install it on your server.`);
  }
  console.log(`[VideoRenderer] FFmpeg verified: ${ffmpegCheck.version}`);

  try {
    // Use project.slides directly (already includes end screen from projectStore)
    const allSlides = project.slides;
    console.log(`[VideoRenderer] Project has ${allSlides.length} total slides`);

    // Validate timeline
    report(5, 'Validating timeline');
    console.log('[VideoRenderer] Step 1: Validating timeline...');
    const validation = validateTimeline(project.slides);
    if (!validation.valid) {
      throw new Error(`Timeline validation failed: ${validation.errors.join(', ')}`);
    }
    console.log('[VideoRenderer] ✓ Timeline validated successfully');

    // Create working directory
    console.log('[VideoRenderer] Step 2: Creating working directories...');
    const workDir = path.join(process.cwd(), 'tmp', 'studio', project.projectId);
    const imagesDir = path.join(workDir, 'images');
    const audioDir = path.join(workDir, 'audio');

    fs.mkdirSync(imagesDir, { recursive: true });
    fs.mkdirSync(audioDir, { recursive: true });
    console.log(`[VideoRenderer] ✓ Work dir created: ${workDir}`);

    // Download images (including end screen)
    report(10, 'Downloading images');
    console.log(`[VideoRenderer] Step 3: Downloading ${allSlides.length} images...`);
    await downloadImages(allSlides, imagesDir);
    console.log('[VideoRenderer] ✓ All images downloaded successfully');

    // Generate QR code if enabled
    report(30, 'Generating QR code');
    console.log('[VideoRenderer] Step 4: Processing QR code...');
    let qrPath: string | null = null;
    if (project.qrCode.enabled && project.qrCode.url) {
      qrPath = path.join(workDir, 'qr.png');
      try {
        console.log(`[VideoRenderer] Generating QR for: ${project.qrCode.url}`);
        await generateQRCode(project.qrCode.url, qrPath, project.qrCode.size);
        console.log('[VideoRenderer] ✓ QR code generated');
      } catch (err) {
        console.warn('[VideoRenderer] ⚠ QR generation failed, continuing without QR:', err);
        qrPath = null;
      }
    } else {
      console.log('[VideoRenderer] QR code disabled, skipping');
    }

    // Download logo if needed
    report(35, 'Downloading logo');
    console.log('[VideoRenderer] Step 5: Processing logo...');
    let logoPath: string | null = null;
    const logoUrl = project.bottomBanner.logoUrl || project.endScreen.logoUrl;
    if (logoUrl) {
      logoPath = path.join(workDir, 'logo.png');
      try {
        console.log(`[VideoRenderer] Downloading logo from: ${logoUrl}`);
        await downloadAndConvertLogo(logoUrl, logoPath);
        console.log('[VideoRenderer] ✓ Logo downloaded and converted');
      } catch (err) {
        console.warn('[VideoRenderer] ⚠ Logo download/conversion failed, continuing without logo:', err);
        logoPath = null;
      }
    } else {
      console.log('[VideoRenderer] No logo URL provided, skipping');
    }

    // Create link icon image if website link is enabled on end screen
    console.log('[VideoRenderer] Step 5.5: Creating link icon...');
    let linkIconPath: string | null = null;
    if (project.endScreen && project.endScreen.websiteLink) {
      linkIconPath = path.join(workDir, 'link_icon.png');
      try {
        console.log(`[VideoRenderer] Creating link icon with text: ${project.endScreen.websiteLink}`);
        await createLinkIconImage(
          linkIconPath,
          project.endScreen.websiteLink,
          project.endScreen.textColor || '#FFFFFF',
          48
        );
        console.log('[VideoRenderer] ✓ Link icon created');
      } catch (err) {
        console.warn('[VideoRenderer] ⚠ Link icon creation failed, continuing without:', err);
        linkIconPath = null;
      }
    } else {
      console.log('[VideoRenderer] No website link on end screen, skipping link icon');
    }

    // Use pre-generated voice or generate TTS on-the-fly
    report(40, 'Processing voice');
    console.log('[VideoRenderer] Step 6: Processing voiceover...');
    let ttsPath: string | null = null;
    if (project.voice.enabled) {
      // Check if audio was pre-generated during project creation
      if (project.voice.audioPath && fs.existsSync(project.voice.audioPath)) {
        console.log(`[VideoRenderer] ✓ Using pre-generated voiceover: ${project.voice.audioPath}`);
        ttsPath = project.voice.audioPath;
      } else if (project.voice.script) {
        // Fallback: Generate on-the-fly if not pre-generated
        console.log('[VideoRenderer] Generating TTS from script (fallback)...');
        ttsPath = await generateTTS(project.voice.script, project.voice.voice);
        
        if (ttsPath && fs.existsSync(ttsPath)) {
          console.log('[VideoRenderer] ✓ TTS generated successfully');
        } else {
          console.warn('[VideoRenderer] ⚠ TTS generation failed');
          ttsPath = null;
        }
      }
    } else {
      console.log('[VideoRenderer] Voice disabled, skipping');
    }

    // Render video with FFmpeg
    report(50, 'Rendering video');
    console.log('[VideoRenderer] Step 7: Starting FFmpeg render...');
    console.log(`[VideoRenderer] Output path: ${outputPath}`);
    await renderWithFFmpeg(project, allSlides, workDir, imagesDir, qrPath, logoPath, linkIconPath, ttsPath, outputPath, resolution, report);
    console.log('[VideoRenderer] ✓ FFmpeg render completed');

    // Cleanup
    report(95, 'Cleaning up');
    console.log('[VideoRenderer] Step 8: Cleanup...');
    setTimeout(() => {
      try {
        fs.rmSync(workDir, { recursive: true, force: true });
        console.log(`[VideoRenderer] Cleaned up working directory: ${workDir}`);
      } catch (cleanupError: any) {
        if (cleanupError.code === 'EBUSY' || cleanupError.code === 'EPERM') {
          console.log(`[VideoRenderer] Could not clean up ${workDir} (files locked), will retry later`);
          // Retry after 10 minutes
          setTimeout(() => {
            try {
              fs.rmSync(workDir, { recursive: true, force: true });
              console.log(`[VideoRenderer] Successfully cleaned up ${workDir} on retry`);
            } catch (retryError: any) {
              console.log(`[VideoRenderer] Cleanup retry failed (${retryError.code}), giving up`);
            }
          }, 10 * 60 * 1000);
        } else {
          console.error(`[VideoRenderer] Cleanup error:`, cleanupError);
        }
      }
    }, 5 * 60 * 1000); // Clean up after 5 minutes

    report(100, 'Complete');
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[VideoRenderer] ===== RENDER COMPLETE ===== (${duration}s)`);
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[VideoRenderer] ===== RENDER FAILED ===== (${duration}s)`);
    console.error('[VideoRenderer] Error details:', error);
    console.error('[VideoRenderer] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    throw error;
  }
}

/**
 * Download images for slides
 */
async function downloadImages(slides: any[], outputDir: string): Promise<void> {
  console.log(`[VideoRenderer] Processing ${slides.length} slides:`);
  slides.forEach((s, i) => {
    console.log(`  [${i}]: ${s.imageUrl || '(blank)'} ${s.isEndScreen ? '[END SCREEN]' : ''}`);
  });

  const downloads = slides.map(async (slide, index) => {
    const fileName = `slide_${index}.jpg`;
    const filePath = path.join(outputDir, fileName);

    try {
      // Remove old file to avoid stale cache (with retry for Windows file locks)
      if (fs.existsSync(filePath)) {
        let retries = 3;
        while (retries > 0) {
          try {
            fs.unlinkSync(filePath);
            console.log(`[VideoRenderer] Removed old cached file for slide ${index}`);
            break;
          } catch (unlinkError: any) {
            if (unlinkError.code === 'EBUSY' && retries > 1) {
              console.log(`[VideoRenderer] File locked, retrying... (${retries - 1} attempts left)`);
              await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms
              retries--;
            } else if (unlinkError.code === 'EBUSY') {
              // File is locked, use a different filename
              const timestamp = Date.now();
              const newFileName = `slide_${index}_${timestamp}.jpg`;
              const newFilePath = path.join(outputDir, newFileName);
              console.log(`[VideoRenderer] File locked, using new name: ${newFileName}`);
              return await processSlideImage(slide, index, newFilePath);
            } else {
              throw unlinkError;
            }
          }
        }
      }

      return await processSlideImage(slide, index, filePath);
    } catch (err) {
      console.error(`[VideoRenderer] ✗ Failed to process slide ${index}:`, err);
      console.error(`[VideoRenderer] Error details:`, {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : 'No stack',
        slide: slide
      });
      throw new Error(`Failed to process image at index ${index}: ${slide.imageUrl}`);
    }
  });

  // Helper function to process a single slide image
  async function processSlideImage(slide: any, index: number, filePath: string) {
    // Handle end screen slide (no image URL)
    if (slide.isEndScreen || !slide.imageUrl || slide.imageUrl === '') {
      // Create a blank colored image for end screen
      console.log(`[VideoRenderer] About to create blank image for slide ${index}...`);
      await createBlankImage(filePath, 1920, 1080, '#1a1a2e');
      console.log(`[VideoRenderer] Created blank end screen slide ${index}`);
      return filePath;
    }

    // Check if this is an uploaded file (local file)
    if (slide.imageUrl.startsWith('/studio/images/')) {
      // This is an uploaded file, copy it instead of downloading
      const publicPath = path.join(process.cwd(), 'public', slide.imageUrl);
      console.log(`[VideoRenderer] Checking for uploaded file at: ${publicPath}`);
      if (fs.existsSync(publicPath)) {
        fs.copyFileSync(publicPath, filePath);
        console.log(`[VideoRenderer] ✓ Copied uploaded slide ${index}: ${slide.imageUrl}`);
        return filePath;
      } else {
        console.error(`[VideoRenderer] ✗ Uploaded file not found: ${publicPath}`);
        throw new Error(`Uploaded file not found: ${slide.imageUrl}`);
      }
    }
    
    // Download from URL
    console.log(`[VideoRenderer] Downloading slide ${index} from: ${slide.imageUrl}`);
    const tempPath = filePath.replace('.jpg', '.tmp');
    
    // Ensure directory exists before downloading
    const dir = path.dirname(tempPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`[VideoRenderer] Created directory: ${dir}`);
    }
    
    try {
      await downloadFile(slide.imageUrl, tempPath);
      
      // Convert to JPG using Sharp (handles webp, png, etc.)
      console.log(`[VideoRenderer] Converting slide ${index} to JPG...`);
      await sharp(tempPath)
        .jpeg({ quality: 95 })
        .toFile(filePath);
      
      // Remove temp file (with retry for Windows file locks)
      if (fs.existsSync(tempPath)) {
        let retries = 3;
        while (retries > 0) {
          try {
            fs.unlinkSync(tempPath);
            console.log(`[VideoRenderer] Cleaned up temp file: ${tempPath}`);
            break;
          } catch (unlinkError: any) {
            if ((unlinkError.code === 'EBUSY' || unlinkError.code === 'EPERM') && retries > 1) {
              console.log(`[VideoRenderer] Temp file locked, retrying... (${retries - 1} attempts left)`);
              await new Promise(resolve => setTimeout(resolve, 200)); // Wait 200ms
              retries--;
            } else {
              console.log(`[VideoRenderer] Could not delete temp file (${unlinkError.code}), will be cleaned up later`);
              break;
            }
          }
        }
      }
      
      console.log(`[VideoRenderer] ✓ Downloaded and converted slide ${index}`);
      return filePath;
    } catch (downloadError: any) {
      console.warn(`[VideoRenderer] ⚠ Failed to download slide ${index}, creating placeholder: ${downloadError.message}`);
      
      // Clean up temp file if it exists
      if (fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch {}
      }
      
      // Create a placeholder image instead of crashing the entire video
      await createPlaceholderImage(filePath, 1920, 1080, index);
      console.log(`[VideoRenderer] ✓ Created placeholder for slide ${index}`);
      return filePath;
    }
  }

  try {
    console.log(`[VideoRenderer] Waiting for all ${downloads.length} download promises...`);
    await Promise.all(downloads);
    console.log(`[VideoRenderer] ✓ All ${slides.length} slides processed successfully`);
  } catch (err) {
    console.error(`[VideoRenderer] Promise.all failed:`, err);
    console.error(`[VideoRenderer] One or more downloads failed`);
    throw err;
  }
}

/**
 * Create a blank colored image using Sharp (more reliable than FFmpeg)
 */
async function createBlankImage(outputPath: string, width: number, height: number, color: string): Promise<void> {
  console.log(`[VideoRenderer] Creating END screen image: ${outputPath} (${width}x${height}, ${color})`);
  
  try {
    // Convert hex color to RGB
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    console.log(`[VideoRenderer] RGB values: r=${r}, g=${g}, b=${b}`);
    
    // Create blank image with "END" text overlay
    console.log(`[VideoRenderer] Creating end screen with text overlay...`);
    
    const createImagePromise = (async () => {
      // Create SVG with "END" text and styling
      const svgText = `
        <svg width="${width}" height="${height}">
          <rect width="100%" height="100%" fill="rgb(${r},${g},${b})"/>
          <text x="50%" y="45%" 
                font-family="Arial, sans-serif" 
                font-size="180" 
                font-weight="bold" 
                fill="white" 
                text-anchor="middle" 
                dominant-baseline="middle">
            END
          </text>
          <text x="50%" y="58%" 
                font-family="Arial, sans-serif" 
                font-size="48" 
                fill="rgba(255,255,255,0.7)" 
                text-anchor="middle" 
                dominant-baseline="middle">
            Thank you for watching
          </text>
        </svg>
      `;
      
      await sharp(Buffer.from(svgText))
        .jpeg({ quality: 90 })
        .toFile(outputPath);
      
      console.log(`[VideoRenderer] ✓ End screen image created successfully`);
    })();
    
    // Add 10-second timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Sharp image creation timed out after 10 seconds')), 10000);
    });
    
    await Promise.race([createImagePromise, timeoutPromise]);
    
  } catch (err) {
    console.error(`[VideoRenderer] createBlankImage ERROR:`, err);
    console.error(`[VideoRenderer] Error type:`, err instanceof Error ? 'Error' : typeof err);
    console.error(`[VideoRenderer] Error message:`, err instanceof Error ? err.message : String(err));
    console.error(`[VideoRenderer] Error stack:`, err instanceof Error ? err.stack : 'No stack');
    throw new Error(`Failed to create blank image: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Create placeholder image for failed downloads
 */
async function createPlaceholderImage(outputPath: string, width: number, height: number, slideIndex: number): Promise<void> {
  console.log(`[VideoRenderer] Creating placeholder image: ${outputPath} (${width}x${height})`);
  
  try {
    const createImagePromise = (async () => {
      // Create SVG with error message
      const svgText = `
        <svg width="${width}" height="${height}">
          <defs>
            <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:#2c3e50;stop-opacity:1" />
              <stop offset="100%" style="stop-color:#34495e;stop-opacity:1" />
            </linearGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#grad1)"/>
          <text x="50%" y="45%" 
                font-family="Arial, sans-serif" 
                font-size="72" 
                font-weight="bold" 
                fill="white" 
                text-anchor="middle" 
                dominant-baseline="middle">
            Image Unavailable
          </text>
          <text x="50%" y="55%" 
                font-family="Arial, sans-serif" 
                font-size="36" 
                fill="rgba(255,255,255,0.7)" 
                text-anchor="middle" 
                dominant-baseline="middle">
            Slide ${slideIndex + 1}
          </text>
        </svg>
      `;
      
      await sharp(Buffer.from(svgText))
        .jpeg({ quality: 90 })
        .toFile(outputPath);
      
      console.log(`[VideoRenderer] ✓ Placeholder image created successfully`);
    })();
    
    // Add 10-second timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Sharp placeholder creation timed out after 10 seconds')), 10000);
    });
    
    await Promise.race([createImagePromise, timeoutPromise]);
    
  } catch (err) {
    console.error(`[VideoRenderer] createPlaceholderImage ERROR:`, err);
    throw new Error(`Failed to create placeholder image: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Download and convert logo (handles SVG to PNG conversion)
 */
async function downloadAndConvertLogo(url: string, outputPath: string): Promise<void> {
  const tempPath = outputPath + '.temp';
  
  try {
    // Download to temp file first
    await downloadFile(url, tempPath);
    
    // Check if it's an SVG file
    const isSvg = url.toLowerCase().endsWith('.svg') || 
                  (fs.existsSync(tempPath) && fs.readFileSync(tempPath, 'utf8').includes('<svg'));
    
    if (isSvg) {
      console.log('[VideoRenderer] Converting SVG logo to PNG...');
      // SVG detected - skip it entirely to avoid FFmpeg errors
      // Most websites work fine without logos in the banner
      fs.unlinkSync(tempPath);
      throw new Error('SVG logos not supported - skipping logo overlay');
    } else {
      // Regular image - convert to PNG using sharp for consistency
      const sharp = (await import('sharp')).default;
      await sharp(tempPath)
        .resize(200, 200, { fit: 'inside', withoutEnlargement: true })
        .png()
        .toFile(outputPath);
      fs.unlinkSync(tempPath);
      console.log('[VideoRenderer] Logo converted to PNG successfully');
    }
  } catch (error) {
    // Clean up temp file
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
    throw error;
  }
}

/**
 * Download file from URL using undici for better reliability
 */
async function downloadFile(url: string, outputPath: string): Promise<void> {
  try {
    console.log(`[VideoRenderer] Fetching URL: ${url}`);
    const response = await undiciFetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': new URL(url).origin,
      },
      signal: AbortSignal.timeout(60000), // 60 second timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    console.log(`[VideoRenderer] Response OK, content-type: ${response.headers.get('content-type')}, size: ${response.headers.get('content-length')} bytes`);
    
    const buffer = await response.arrayBuffer();
    console.log(`[VideoRenderer] Downloaded ${buffer.byteLength} bytes`);
    
    fs.writeFileSync(outputPath, Buffer.from(buffer));
    console.log(`[VideoRenderer] Wrote file to ${outputPath}`);
  } catch (error: any) {
    console.error(`[VideoRenderer] Download error for ${url}:`, error.message);
    // Clean up partial file (ignore errors if file is locked)
    try {
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
    } catch (cleanupError: any) {
      console.log(`[VideoRenderer] Could not clean up temp file (${cleanupError.code}), ignoring...`);
    }
    throw new Error(`Failed to download ${url}: ${error.message}`);
  }
}

/**
 * Render video with FFmpeg
 */
async function renderWithFFmpeg(
  project: Project,
  allSlides: any[],
  workDir: string,
  imagesDir: string,
  qrPath: string | null,
  logoPath: string | null,
  linkIconPath: string | null,
  ttsPath: string | null,
  outputPath: string,
  resolution: '1080p' | '720p',
  onProgress: (progress: number, stage: string) => void
): Promise<void> {
  const width = resolution === '1080p' ? 1920 : 1280;
  const height = resolution === '1080p' ? 1080 : 720;

  console.log('[VideoRenderer] ========== Render Summary ==========');
  console.log(`[VideoRenderer] Resolution: ${resolution} (${width}x${height})`);
  console.log(`[VideoRenderer] Total slides: ${allSlides.length}`);
  console.log(`[VideoRenderer] Music: ${project.music.enabled ? 'Enabled' : 'Disabled'}${project.music.filePath ? ` (${project.music.filePath})` : ''}`);
  console.log(`[VideoRenderer] Voice: ${project.voice.enabled ? 'Enabled' : 'Disabled'}${ttsPath ? ` (${ttsPath})` : ''}`);
  console.log(`[VideoRenderer] Logo: ${logoPath ? `Yes (${logoPath})` : 'No'}`);
  console.log(`[VideoRenderer] QR: ${project.qrCode.enabled ? `Enabled (${qrPath})` : 'Disabled'}`);
  console.log(`[VideoRenderer] Banner: ${project.bottomBanner.enabled ? 'Enabled' : 'Disabled'}`);
  console.log('[VideoRenderer] ====================================');

  // Build FFmpeg command
  const args: string[] = [];
  
  console.log('[VideoRenderer] Total slides:', allSlides.length);
  console.log('[VideoRenderer] Slides:', allSlides.map((s, i) => `${i}: ${s.imageUrl || 'BLANK'} (${s.startTime}s-${s.endTime}s) ${s.isEndScreen ? '[END]' : ''}`).join(', '));

  // Input: images with loop and duration
  // IMPORTANT: For xfade transitions to work, each clip (except the last) needs to be extended
  // by the transition duration so there's overlap for the crossfade
  // CRITICAL: Transition duration MUST be less than slide duration (3s) to avoid negative offsets
  const transitionDuration = 0.8; // Standard transition duration
  console.log(`[VideoRenderer] Transition duration: ${transitionDuration}s per transition`);
  console.log(`[VideoRenderer] Processing ${allSlides.length} slides with timings:`);
  allSlides.forEach((slide, idx) => {
    console.log(`  Slide ${idx}: ${slide.startTime}s → ${slide.endTime}s (duration: ${slide.endTime - slide.startTime}s)${slide.isEndScreen ? ' [END SCREEN]' : ''}`);
  });
  
  let inputIndex = 0;
  allSlides.forEach((slide, slideIndex) => {
    const imagePath = path.join(imagesDir, `slide_${slideIndex}.jpg`);
    const baseDuration = slide.endTime - slide.startTime;
    
    // Extend duration for all slides except the last to allow for transition overlap
    const duration = slideIndex < allSlides.length - 1 
      ? baseDuration + transitionDuration 
      : baseDuration;

    args.push('-loop', '1');
    args.push('-t', duration.toString());
    args.push('-i', imagePath);
    console.log(`[VideoRenderer] Input ${slideIndex}: ${imagePath} (base: ${baseDuration}s, extended: ${duration}s)`);
    inputIndex++;
  });

  // Note: End screen is now part of allSlides, no special handling needed

  // Input: music (if enabled)
  let musicInputIndex: number | null = null;
  const nextInputIndex = allSlides.length; // All slides are now in allSlides array
  if (project.music.enabled && project.music.filePath && fs.existsSync(project.music.filePath)) {
    musicInputIndex = nextInputIndex;
    args.push('-i', project.music.filePath);
    console.log(`[VideoRenderer] Music input at index ${musicInputIndex}: ${project.music.filePath}`);
  } else if (project.music.enabled) {
    console.log(`[VideoRenderer] Music enabled but no file (filePath: ${project.music.filePath})`);
  }

  // Input: TTS (if available)
  let ttsInputIndex: number | null = null;
  if (ttsPath && fs.existsSync(ttsPath)) {
    ttsInputIndex = musicInputIndex !== null ? musicInputIndex + 1 : nextInputIndex;
    args.push('-i', ttsPath);
    console.log(`[VideoRenderer] TTS input at index ${ttsInputIndex}: ${ttsPath}`);
  } else if (project.voice.enabled) {
    console.log(`[VideoRenderer] Voice enabled but no TTS file (path: ${ttsPath})`);
  }

  // Input: Logo (if available)
  let logoInputIndex: number | null = null;
  if (logoPath && fs.existsSync(logoPath) && (project.endScreen.logoUrl || project.bottomBanner.logoUrl)) {
    logoInputIndex = ttsInputIndex !== null ? ttsInputIndex + 1 : (musicInputIndex !== null ? musicInputIndex + 1 : nextInputIndex);
    args.push('-i', logoPath);
    console.log(`[VideoRenderer] Logo input at index ${logoInputIndex}: ${logoPath}`);
  }

  // Input: QR Code (if available)
  let qrInputIndex: number | null = null;
  if (qrPath && fs.existsSync(qrPath) && project.qrCode.enabled) {
    qrInputIndex = logoInputIndex !== null ? logoInputIndex + 1 : (ttsInputIndex !== null ? ttsInputIndex + 1 : (musicInputIndex !== null ? musicInputIndex + 1 : nextInputIndex));
    args.push('-i', qrPath);
    console.log(`[VideoRenderer] QR input at index ${qrInputIndex}: ${qrPath}`);
  }

  // Input: Link Icon (if available)
  let linkIconInputIndex: number | null = null;
  if (linkIconPath && fs.existsSync(linkIconPath)) {
    linkIconInputIndex = qrInputIndex !== null ? qrInputIndex + 1 : (logoInputIndex !== null ? logoInputIndex + 1 : (ttsInputIndex !== null ? ttsInputIndex + 1 : (musicInputIndex !== null ? musicInputIndex + 1 : nextInputIndex)));
    args.push('-i', linkIconPath);
    console.log(`[VideoRenderer] Link icon input at index ${linkIconInputIndex}: ${linkIconPath}`);
  }

  // Build filter complex
  const filterParts: string[] = [];

  // Scale, pad, and apply motion graphics to images (Ken Burns effect)
  allSlides.forEach((slide, i) => {
    let filterChain = `[${i}:v]`;
    
    // Apply motion graphics (zoompan) before scaling if enabled
    if (slide.motion && slide.motion.type !== 'none' && !slide.isEndScreen) {
      const fps = 25; // Frame rate
      const duration = slide.endTime - slide.startTime;
      const frames = Math.floor(duration * fps);
      const intensity = (slide.motion.intensity || 5) / 10; // Convert 1-10 to 0.1-1.0
      
      switch (slide.motion.type) {
        case 'zoom-in':
          // Zoom from 100% to 105%
          filterChain += `zoompan=z='min(zoom+${0.0015 * intensity},1.05)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height},`;
          break;
        case 'zoom-out':
          // Zoom from 110% to 100%
          filterChain += `zoompan=z='if(lte(zoom,1.0),1.0,max(1.0,1.1-on*${0.0015 * intensity}))':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height},`;
          break;
        case 'pan-left':
          // Pan from right to left
          filterChain += `zoompan=z=1.1:d=${frames}:x='iw-iw/zoom-${intensity * 2}*on':y='ih/2-(ih/zoom/2)':s=${width}x${height},`;
          break;
        case 'pan-right':
          // Pan from left to right
          filterChain += `zoompan=z=1.1:d=${frames}:x='0+${intensity * 2}*on':y='ih/2-(ih/zoom/2)':s=${width}x${height},`;
          break;
        case 'pan-up':
          // Pan from bottom to top
          filterChain += `zoompan=z=1.1:d=${frames}:x='iw/2-(iw/zoom/2)':y='ih-ih/zoom-${intensity * 2}*on':s=${width}x${height},`;
          break;
        case 'pan-down':
          // Pan from top to bottom
          filterChain += `zoompan=z=1.1:d=${frames}:x='iw/2-(iw/zoom/2)':y='0+${intensity * 2}*on':s=${width}x${height},`;
          break;
      }
    }
    
    // Apply crop if specified
    if (slide.crop) {
      const cropW = Math.floor(slide.crop.width * width);
      const cropH = Math.floor(slide.crop.height * height);
      const cropX = Math.floor(slide.crop.x * width);
      const cropY = Math.floor(slide.crop.y * height);
      filterChain += `crop=w=${cropW}:h=${cropH}:x=${cropX}:y=${cropY},`;
    }
    
    // Scale and pad to final dimensions
    filterChain += `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,` +
      `format=yuv420p,setsar=1[v${i}]`;
    
    filterParts.push(filterChain);
  });

  // Apply xfade transitions between slides
  if (allSlides.length > 1) {
    // transitionDuration already defined at top of function (0.8)
    console.log(`[VideoRenderer] Applying xfade transitions (${transitionDuration}s duration)...`);
    
    // Map transition names to xfade types
    const getXfadeType = (transition?: string): string => {
      const mapping: Record<string, string> = {
        'fade': 'fade',
        'slideup': 'slideup',
        'slidedown': 'slidedown',
        'slideleft': 'slideleft',
        'slideright': 'slideright',
        'zoomin': 'fade', // xfade doesn't have zoom, use fade
        'zoomout': 'fade',
        'wipeleft': 'wipeleft',
        'wiperight': 'wiperight',
        'circlecrop': 'circlecrop'
      };
      return mapping[transition || 'fade'] || 'fade';
    };
    
    // Build xfade chain - offset is RELATIVE to current accumulated stream length
    // Each xfade operates on the output of the previous xfade
    let currentLabel = '[v0]';
    let currentStreamLength = allSlides[0].endTime - allSlides[0].startTime; // First slide base duration (3s)
    
    for (let i = 1; i < allSlides.length; i++) {
      const currentSlide = allSlides[i];
      const transitionType = getXfadeType(currentSlide.transition);
      
      // Offset: where in the CURRENT stream (currentLabel) should the transition start
      // We want it to start at the current accumulated stream length
      const offset = currentStreamLength;
      
      console.log(`[VideoRenderer] Transition ${i}: ${transitionType} at offset ${offset.toFixed(1)}s (current stream length: ${currentStreamLength.toFixed(1)}s)`);
      
      // Apply xfade between accumulated stream and next slide
      const outputLabel = i === allSlides.length - 1 ? '[vconcat]' : `[vx${i}]`;
      filterParts.push(
        `${currentLabel}[v${i}]xfade=transition=${transitionType}:duration=${transitionDuration}:offset=${offset}${outputLabel}`
      );
      
      // Update stream length: add new slide's base duration
      const newSlideBaseDuration = currentSlide.endTime - currentSlide.startTime;
      currentStreamLength += newSlideBaseDuration;
      
      currentLabel = outputLabel;
    }
  } else {
    // Single slide, no transitions needed
    filterParts.push(`[v0]copy[vconcat]`);
  }

  // Split concatenated video for end screen overlay
  // We need to apply end screen text only to the end screen portion
  const endScreenSlide = allSlides.find(s => s.isEndScreen);
  const endScreenIndex = allSlides.findIndex(s => s.isEndScreen);
  
  // Calculate actual duration after xfade transitions
  // Each transition creates a 0.8s overlap, so we lose 0.8s per transition
  // transitionDuration already defined at top of function (0.8)
  const numTransitions = allSlides.length - 1;
  const totalDurationWithoutTransitions = calculateDuration(allSlides);
  const actualTotalDuration = totalDurationWithoutTransitions - (numTransitions * transitionDuration);
  
  // Calculate content vs end screen timing
  // Content duration = length of content slides stream (before end screen) after xfade transitions
  const endScreenDuration = endScreenSlide ? (endScreenSlide.endTime - endScreenSlide.startTime) : 0;
  const adjustedEndScreenDuration = endScreenDuration; // End screen keeps full duration
  
  const numContentSlides = endScreenSlide ? project.slides.length - 1 : project.slides.length;
  const numContentTransitions = Math.max(0, numContentSlides - 1);
  
  // Calculate content stream length: sum of content slide durations minus transition overlaps
  const contentSlidesDuration = project.slides
    .slice(0, numContentSlides)
    .reduce((sum, slide) => sum + (slide.endTime - slide.startTime), 0);
  
  const contentDuration = contentSlidesDuration - (numContentTransitions * transitionDuration);
  
  console.log(`[VideoRenderer] DEBUG: numContentSlides=${numContentSlides}, contentSlidesDuration=${contentSlidesDuration}s, numContentTransitions=${numContentTransitions}, transitionOverlap=${numContentTransitions * transitionDuration}s`);
  console.log(`[VideoRenderer] Timeline: total=${actualTotalDuration}s, content=${contentDuration}s (${numContentSlides} slides), endscreen=${adjustedEndScreenDuration}s`);

  let videoStream = '[vconcat]';

  // Add end screen text overlay if enabled
  if (project.endScreen.enabled && endScreenSlide && project.endScreen.type === 'text') {
    // Split video: content part and end screen part
    filterParts.push(`[vconcat]split=2[vcontent][vendscreen]`);
    
    // Trim content part (everything before end screen)
    if (contentDuration > 0) {
      filterParts.push(`[vcontent]trim=end=${contentDuration},setpts=PTS-STARTPTS[vcontentfinal]`);
    }
    
    // Trim end screen part
    filterParts.push(`[vendscreen]trim=start=${contentDuration},setpts=PTS-STARTPTS[vendtrim]`);
    
    // Write text to files to avoid FFmpeg escaping issues
    let currentStream = '[vendtrim]';
    
    // White background
    filterParts.push(`${currentStream}drawbox=x=0:y=0:w=${width}:h=${height}:color=#FFFFFF:t=fill[vendbg]`);
    currentStream = '[vendbg]';
    
    // Add "END" text in large letters at center if no company name
    const hasCompanyName = project.endScreen.companyName && project.endScreen.companyName.trim();
    const hasPhoneNumber = project.endScreen.phoneNumber && project.endScreen.phoneNumber.trim();
    const hasWebsiteLink = project.endScreen.websiteLink && project.endScreen.websiteLink.trim();
    
    // If no content at all, show "END" text
    if (!hasCompanyName && !hasPhoneNumber && !hasWebsiteLink) {
      const endTextPath = path.join(workDir, 'endscreen_end.txt');
      fs.writeFileSync(endTextPath, 'END', 'utf-8');
      const endTextFile = endTextPath
        .replace(/\\/g, '/')
        .replace(/:/g, '\\\\:')
        .replace(/ /g, '\\\\ ');
      
      filterParts.push(
        `${currentStream}drawtext=textfile=${endTextFile}:fontsize=200:fontcolor=#1a1a2e:` +
        `x=(w-text_w)/2:y=(h-text_h)/2:fontfile=/Windows/Fonts/arialbd.ttf[vendend]`
      );
      currentStream = '[vendend]';
    } else {
      // Company name at top center
      if (hasCompanyName) {
        const companyNamePath = path.join(workDir, 'endscreen_company.txt');
        fs.writeFileSync(companyNamePath, project.endScreen.companyName, 'utf-8');
        const companyNameFile = companyNamePath
          .replace(/\\/g, '/')
          .replace(/:/g, '\\\\:')
          .replace(/ /g, '\\\\ ');
        
        filterParts.push(
          `${currentStream}drawtext=textfile=${companyNameFile}:fontsize=72:fontcolor=${project.endScreen.textColor}:` +
          `x=(w-text_w)/2:y=120[vendcompany]`
        );
        currentStream = '[vendcompany]';
      }
      
      // Phone number in center
      if (hasPhoneNumber) {
        const phoneNumberPath = path.join(workDir, 'endscreen_phone.txt');
        fs.writeFileSync(phoneNumberPath, project.endScreen.phoneNumber, 'utf-8');
        const phoneNumberFile = phoneNumberPath
          .replace(/\\/g, '/')
          .replace(/:/g, '\\\\:')
          .replace(/ /g, '\\\\ ');
        
        filterParts.push(
          `${currentStream}drawtext=textfile=${phoneNumberFile}:fontsize=140:fontcolor=${project.endScreen.phoneNumberColor}:` +
          `x=(w-text_w)/2:y=(h-text_h)/2:fontfile=/Windows/Fonts/arialbd.ttf[vendphone]`
        );
        currentStream = '[vendphone]';
      }
      
      // Website link at bottom center with link icon
      if (hasWebsiteLink && linkIconInputIndex !== null) {
        // Overlay the link icon image at bottom center
        filterParts.push(
          `${currentStream}[${linkIconInputIndex}:v]overlay=(W-w)/2:H-180[vendlink]`
        );
        currentStream = '[vendlink]';
      }
    }
    
    // Add logo overlay if available (top-left corner)
    if (logoInputIndex !== null && project.endScreen.logoUrl) {
      // Scale logo for end screen
      filterParts.push(`[${logoInputIndex}:v]scale=-1:100[endlogo]`);
      
      // Overlay logo at top left
      filterParts.push(`${currentStream}[endlogo]overlay=60:60[vendfinal]`);
    } else {
      // No logo, rename current stream to vendfinal
      filterParts.push(`${currentStream}copy[vendfinal]`);
    }
    
    // Concatenate content and end screen parts back together
    if (contentDuration > 0) {
      filterParts.push(`[vcontentfinal][vendfinal]concat=n=2:v=1:a=0[vbase]`);
      videoStream = '[vbase]';
    } else {
      // No content, only end screen
      videoStream = '[vendfinal]';
    }
  } else {
    // No end screen overlay, use concatenated video directly
    videoStream = '[vconcat]';
  }

  // Track current video stream label
  // let videoStream = '[vbase]';

  // Add banner overlay with transparent background and slide-in animation
  if (project.bottomBanner.enabled && project.bottomBanner.text) {
    const bannerHeight = 80;
    const y = project.bottomBanner.position === 'bottom' ? height - bannerHeight : 0;
    const animationDuration = 0.5; // Slide in over 0.5 seconds
    
    // Parse text to extract company name and website
    // Format: "CompanyName | website.com" or just text
    const bannerText = project.bottomBanner.text;
    const companyName = project.business?.title || project.brand?.name || bannerText;
    const websiteUrl = project.qrCode?.url ? new URL(project.qrCode.url).hostname.replace('www.', '') : '';
    
    // Write company name and website to separate files
    const companyTextPath = path.join(workDir, 'banner_company.txt');
    const websiteTextPath = path.join(workDir, 'banner_website.txt');
    
    fs.writeFileSync(companyTextPath, companyName, 'utf-8');
    const companyTextFile = companyTextPath
      .replace(/\\/g, '/')
      .replace(/:/g, '\\\\:')
      .replace(/ /g, '\\\\ ');
    
    if (websiteUrl) {
      fs.writeFileSync(websiteTextPath, websiteUrl, 'utf-8');
    }
    const websiteTextFile = websiteTextPath
      .replace(/\\/g, '/')
      .replace(/:/g, '\\\\:')
      .replace(/ /g, '\\\\ ');
    
    if (logoInputIndex !== null && project.bottomBanner.logoUrl) {
      // Slide-in animation from bottom: starts at y+bannerHeight, slides to y
      const slideInY = `if(lt(t,${animationDuration}),${y}+${bannerHeight}*(1-t/${animationDuration}),${y})`;
      
      // Draw semi-transparent banner (0.6 opacity for better transparency)
      filterParts.push(
        `${videoStream}drawbox=x=0:y='${slideInY}':w=${width}:h=${bannerHeight}:color=black@0.6:t=fill[vtemp1]`
      );
      
      // Scale and position logo with slide-in animation
      filterParts.push(`[${logoInputIndex}:v]scale=-1:60[bannerlogo]`);
      filterParts.push(
        `[vtemp1][bannerlogo]overlay=20:y='${slideInY}'+10:shortest=1[vtemp2]`
      );
      
      // Add company name in center with slide-in
      filterParts.push(
        `[vtemp2]drawtext=textfile=${companyTextFile}:fontsize=32:fontcolor=white:x=(w-text_w)/2:y='${slideInY}'+${bannerHeight/2 - 16}[vtemp3]`
      );
      
      // Add website URL on right with slide-in (if available)
      if (websiteUrl) {
        filterParts.push(
          `[vtemp3]drawtext=textfile=${websiteTextFile}:fontsize=24:fontcolor=white:x=w-text_w-20:y='${slideInY}'+${bannerHeight/2 - 12}[vwithbanner]`
        );
      } else {
        filterParts.push(`[vtemp3]copy[vwithbanner]`);
      }
    } else {
      // Draw banner without logo - just company name in center with slide-in
      const slideInY = `if(lt(t,${animationDuration}),${y}+${bannerHeight}*(1-t/${animationDuration}),${y})`;
      
      filterParts.push(
        `${videoStream}drawbox=x=0:y='${slideInY}':w=${width}:h=${bannerHeight}:color=black@0.6:t=fill,` +
        `drawtext=textfile=${companyTextFile}:fontsize=32:fontcolor=white:x=(w-text_w)/2:y='${slideInY}'+${bannerHeight/2 - 16}[vwithbanner]`
      );
    }
    
    videoStream = '[vwithbanner]';
  } else {
    filterParts.push(`${videoStream}copy[vwithbanner]`);
    videoStream = '[vwithbanner]';
  }

  // Add QR overlay
  if (qrInputIndex !== null && project.qrCode.enabled) {
    const padding = 20;
    let x = width - project.qrCode.size - padding;
    let y = padding;

    if (project.qrCode.position === 'top-left') {
      x = padding;
      y = padding;
    } else if (project.qrCode.position === 'bottom-right') {
      x = width - project.qrCode.size - padding;
      y = height - project.qrCode.size - padding;
    } else if (project.qrCode.position === 'bottom-left') {
      x = padding;
      y = height - project.qrCode.size - padding;
    }
    
    filterParts.push(`[${qrInputIndex}:v]scale=${project.qrCode.size}:${project.qrCode.size}[qrscaled]`);
    filterParts.push(`${videoStream}[qrscaled]overlay=${x}:${y}:shortest=1[vout]`);
  } else {
    filterParts.push(`${videoStream}null[vout]`);
  }

  // Audio filter - use actual duration after transitions (already calculated above)
  console.log(`[VideoRenderer] Audio duration: ${actualTotalDuration}s (raw: ${totalDurationWithoutTransitions}s, ${numTransitions} transitions)`);
  
  const audioFilter = buildAudioFilter(
    project.music,
    project.voice,
    musicInputIndex,
    ttsInputIndex,
    actualTotalDuration
  );

  if (audioFilter) {
    filterParts.push(audioFilter);
  } else {
    // Add silent audio track for proper duration metadata
    filterParts.push(`anullsrc=channel_layout=stereo:sample_rate=44100,atrim=duration=${actualTotalDuration}[aout]`);
  }

  args.push('-filter_complex', filterParts.join(';'));
  
  // Log the full filter chain for debugging
  console.log('[VideoRenderer] ===== FFmpeg Filter Chain =====');
  console.log(filterParts.join(';\n'));
  console.log('[VideoRenderer] ================================');

  // Map outputs
  args.push('-map', '[vout]');
  args.push('-map', '[aout]');

  // Output settings
  args.push('-c:v', 'libx264');
  // Use ultrafast for preview, fast for final
  args.push('-preset', resolution === '720p' ? 'ultrafast' : 'fast');
  args.push('-crf', resolution === '720p' ? '28' : '23');
  args.push('-pix_fmt', 'yuv420p');
  args.push('-c:a', 'aac');
  args.push('-b:a', '128k');
  args.push('-ar', '44100'); // Audio sample rate
  
  // Resource management to prevent "Resource temporarily unavailable" errors
  args.push('-max_muxing_queue_size', '9999'); // Increase buffer size
  args.push('-bufsize', '2000k'); // Increase buffer size
  args.push('-filter_complex_threads', '1'); // Limit filter threads to reduce memory
  
  // Disable expensive filters for faster encoding
  args.push('-tune', 'fastdecode');
  args.push('-threads', '0'); // Use all CPU cores

  args.push('-movflags', '+faststart');
  args.push('-y'); // Overwrite
  args.push(outputPath);

  console.log(`[VideoRenderer] FFmpeg command: ffmpeg ${args.join(' ')}`);

  // Execute FFmpeg
  return new Promise((resolve, reject) => {
    let ffmpeg;
    
    try {
      ffmpeg = spawn('ffmpeg', args);
    } catch (spawnError: any) {
      console.error('[VideoRenderer] FFmpeg spawn error:', spawnError);
      reject(new Error(`Failed to start FFmpeg: ${spawnError.message}. Ensure FFmpeg is installed and in PATH.`));
      return;
    }

    let stderr = '';
    let lastProgress = -1;
    let progressTimeout: NodeJS.Timeout;
    
    // Calculate actual duration for progress tracking
    // transitionDuration already defined at top of function (0.8)
    const numTransitions = allSlides.length - 1;
    const actualDuration = calculateDuration(allSlides) - (numTransitions * transitionDuration);
    
    // Timeout if no progress for 60 seconds
    const resetProgressTimeout = () => {
      if (progressTimeout) clearTimeout(progressTimeout);
      progressTimeout = setTimeout(() => {
        console.error('[VideoRenderer] FFmpeg timeout - no progress for 60 seconds');
        console.error('[VideoRenderer] Last stderr output:', stderr.slice(-500));
        ffmpeg.kill('SIGKILL');
        reject(new Error('Video rendering timeout - no progress for 60 seconds. This may be due to invalid filter chain or missing inputs.'));
      }, 60000);
    };
    
    resetProgressTimeout();

    ffmpeg.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      
      // Reset timeout on any output
      resetProgressTimeout();
      
      // Parse progress from FFmpeg output (only log when progress changes)
      const timeMatch = chunk.match(/time=(\d{2}):(\d{2}):(\d{2})/);
      if (timeMatch) {
        const hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        const seconds = parseInt(timeMatch[3]);
        const currentTime = hours * 3600 + minutes * 60 + seconds;
        const progress = Math.min(95, 50 + Math.floor((currentTime / actualDuration) * 45));
        
        if (progress !== lastProgress) {
          lastProgress = progress;
          onProgress(progress, 'Rendering video');
          console.log(`[VideoRenderer] Progress: ${progress}% (${currentTime}s / ${actualDuration}s)`);
        }
      }
    });

    ffmpeg.on('close', (code) => {
      if (progressTimeout) clearTimeout(progressTimeout);
      
      if (code === 0) {
        console.log(`[VideoRenderer] Video rendered successfully: ${outputPath}`);
        resolve();
      } else {
        console.error(`[VideoRenderer] FFmpeg failed with code ${code}`);
        console.error('[VideoRenderer] Full stderr:', stderr);
        
        // Check for specific error patterns and provide helpful messages
        let errorHint = '';
        if (stderr.includes('Resource temporarily unavailable')) {
          errorHint = ' This appears to be a resource/memory issue. The server may need more RAM or the filter chain is too complex.';
        } else if (stderr.includes('Failed to configure output pad')) {
          errorHint = ' This is a filter configuration error. Check audio/video stream compatibility.';
        } else if (stderr.includes('Error reinitializing filters')) {
          errorHint = ' Filter reinitialization failed. This may be due to incompatible stream formats or resource limits.';
        }
        
        reject(new Error(`FFmpeg exited with code ${code}. Check logs for details.${errorHint}`));
      }
    });

    ffmpeg.on('error', (err) => {
      if (progressTimeout) clearTimeout(progressTimeout);
      console.error('[VideoRenderer] FFmpeg spawn error:', err);
      reject(err);
    });
  });
}
