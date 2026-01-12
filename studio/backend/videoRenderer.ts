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
import { buildInputList, calculateDuration, validateTimeline, normalizeTimeline, addEndScreen } from './timelineBuilder';
import { generateBannerFilter, generateQRFilter, generateEndScreenFilter } from './overlayRenderer';
import { generateTTS, buildAudioFilter } from './audioMixer';
import { generateQRCode } from './qrGenerator';

/**
 * Sanitize text for FFmpeg drawtext filter
 * Escapes single quotes for use in text='' parameter
 */
function sanitizeFFmpegText(text: string): string {
  return text.replace(/'/g, "'\\\\\\\\''");
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

  try {
    // Use project.slides directly (already includes end screen from projectStore)
    const allSlides = project.slides;

    // Validate timeline
    report(5, 'Validating timeline');
    const validation = validateTimeline(project.slides);
    if (!validation.valid) {
      throw new Error(`Timeline validation failed: ${validation.errors.join(', ')}`);
    }

    // Create working directory (use /tmp for serverless compatibility)
    const workDir = path.join('/tmp', 'studio', project.projectId);
    const imagesDir = path.join(workDir, 'images');
    const audioDir = path.join(workDir, 'audio');

    fs.mkdirSync(imagesDir, { recursive: true });
    fs.mkdirSync(audioDir, { recursive: true });

    // Download images (including end screen)
    report(10, 'Downloading images');
    await downloadImages(allSlides, imagesDir);

    // Generate QR code if enabled
    report(30, 'Generating QR code');
    let qrPath: string | null = null;
    if (project.qrCode.enabled && project.qrCode.url) {
      qrPath = path.join(workDir, 'qr.png');
      try {
        await generateQRCode(project.qrCode.url, qrPath, project.qrCode.size);
      } catch (err) {
        console.warn('[VideoRenderer] QR generation failed, continuing without QR:', err);
        qrPath = null;
      }
    }

    // Download logo if needed
    report(35, 'Downloading logo');
    let logoPath: string | null = null;
    const logoUrl = project.bottomBanner.logoUrl || project.endScreen.logoUrl;
    if (logoUrl) {
      logoPath = path.join(workDir, 'logo.png');
      try {
        await downloadFile(logoUrl, logoPath);
        console.log(`[VideoRenderer] Downloaded logo: ${logoUrl}`);
      } catch (err) {
        console.warn('[VideoRenderer] Logo download failed, continuing without logo:', err);
        logoPath = null;
      }
    }

    // Use Speaktor-generated voice or generate TTS
    report(40, 'Processing voice');
    let ttsPath: string | null = null;
    if (project.voice.enabled) {
      if (project.voice.audioPath) {
        // Use Speaktor-generated audio from frontend
        const speaktorPath = path.join(process.cwd(), 'public', project.voice.audioPath);
        if (fs.existsSync(speaktorPath)) {
          ttsPath = speaktorPath;
          console.log(`[VideoRenderer] Using Speaktor-generated voiceover: ${ttsPath}`);
        } else {
          console.warn(`[VideoRenderer] Speaktor audio not found: ${speaktorPath}`);
        }
      } else if (project.voice.script) {
        // Fallback to old TTS system
        ttsPath = path.join(audioDir, 'voice.wav');
        await generateTTS(project.voice, ttsPath);
        
        // Check if file was actually created
        if (!fs.existsSync(ttsPath)) {
          ttsPath = null;
        }
      }
    }

    // Render video with FFmpeg
    report(50, 'Rendering video');
    await renderWithFFmpeg(project, allSlides, workDir, imagesDir, qrPath, logoPath, ttsPath, outputPath, resolution, report);

    // Cleanup
    report(95, 'Cleaning up');
    setTimeout(() => {
      fs.rmSync(workDir, { recursive: true, force: true });
      console.log(`[VideoRenderer] Cleaned up working directory: ${workDir}`);
    }, 5 * 60 * 1000); // Clean up after 5 minutes

    report(100, 'Complete');
  } catch (error) {
    console.error('[VideoRenderer] Rendering failed:', error);
    throw error;
  }
}

/**
 * Download images for slides
 */
async function downloadImages(slides: any[], outputDir: string): Promise<void> {
  const downloads = slides.map(async (slide, index) => {
    const fileName = `slide_${index}.jpg`;
    const filePath = path.join(outputDir, fileName);

    try {
      // Skip if file already exists (cache)
      if (fs.existsSync(filePath)) {
        console.log(`[VideoRenderer] Using cached slide ${index}: ${filePath}`);
        return;
      }

      // Handle end screen slide (no image URL)
      if (slide.isEndScreen || !slide.imageUrl || slide.imageUrl === '') {
        // Create a blank colored image for end screen
        await createBlankImage(filePath, 1920, 1080, '#1a1a2e');
        console.log(`[VideoRenderer] Created blank end screen slide ${index}`);
        return;
      }

      // Check if file is a local upload (starts with / indicating public folder)
      if (slide.imageUrl.startsWith('/')) {
        // This is an uploaded file in public folder, copy it instead of downloading
        const publicPath = path.join(process.cwd(), 'public', slide.imageUrl);
        if (fs.existsSync(publicPath)) {
          fs.copyFileSync(publicPath, filePath);
          console.log(`[VideoRenderer] Copied uploaded slide ${index}: ${slide.imageUrl}`);
          return;
        } else {
          console.warn(`[VideoRenderer] Local file not found: ${publicPath}`);
        }
      }
      
      // Check for file:// protocol (uploaded files)
      if (slide.imageUrl.startsWith('file://')) {
        const localPath = slide.imageUrl.replace('file://', '');
        if (fs.existsSync(localPath)) {
          fs.copyFileSync(localPath, filePath);
          console.log(`[VideoRenderer] Copied file:// slide ${index}: ${localPath}`);
          return;
        }
      }
      
      // Download external URL (scraped images)
      console.log(`[VideoRenderer] Downloading slide ${index} from: ${slide.imageUrl}`);
      await downloadFile(slide.imageUrl, filePath);
      console.log(`[VideoRenderer] Downloaded slide ${index}: ${slide.imageUrl}`);
      
      // Verify the downloaded file exists and has content
      if (!fs.existsSync(filePath)) {
        throw new Error(`Downloaded file does not exist: ${filePath}`);
      }
      const stats = fs.statSync(filePath);
      if (stats.size === 0) {
        throw new Error(`Downloaded file is empty: ${filePath}`);
      }
      console.log(`[VideoRenderer] Verified slide ${index}: ${stats.size} bytes`);
      
    } catch (err) {
      console.error(`[VideoRenderer] Failed to process slide ${index} (${slide.imageUrl}):`, err);
      // Create a fallback placeholder image instead of failing
      try {
        await createBlankImage(filePath, 1920, 1080, '#333333');
        console.warn(`[VideoRenderer] Created placeholder for failed slide ${index}`);
      } catch (fallbackErr) {
        console.error(`[VideoRenderer] Failed to create placeholder for slide ${index}:`, fallbackErr);
        throw new Error(`Failed to download image and create placeholder: ${slide.imageUrl}`);
      }
    }
  });

  await Promise.all(downloads);
}

/**
 * Create a blank colored image using FFmpeg
 */
function createBlankImage(outputPath: string, width: number, height: number, color: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-f', 'lavfi',
      '-i', `color=c=${color}:s=${width}x${height}:d=1`,
      '-frames:v', '1',
      '-y',
      outputPath
    ]);

    let stderr = '';
    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg failed to create blank image: ${stderr}`));
      }
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`FFmpeg spawn error: ${err.message}`));
    });
  });
}

/**
 * Download file from URL
 */
function downloadFile(url: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    const file = fs.createWriteStream(outputPath);

    const options = {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': new URL(url).origin,
      }
    };

    protocol.get(url, options, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          file.close();
          fs.unlinkSync(outputPath);
          downloadFile(redirectUrl, outputPath).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(outputPath);
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });

      file.on('error', (err) => {
        fs.unlinkSync(outputPath);
        reject(err);
      });
    }).on('error', (err) => {
      if (file) {
        file.close();
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
      }
      reject(err);
    });
  });
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
  let inputIndex = 0;
  allSlides.forEach((slide, slideIndex) => {
    const imagePath = path.join(imagesDir, `slide_${slideIndex}.jpg`);
    const duration = slide.endTime - slide.startTime;

    args.push('-loop', '1');
    args.push('-t', duration.toString());
    args.push('-i', imagePath);
    console.log(`[VideoRenderer] Input ${slideIndex}: ${imagePath} (duration: ${duration}s)`);
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

  // Build filter complex
  const filterParts: string[] = [];

  // Scale and pad images (use allSlides which includes end screen)
  allSlides.forEach((slide, i) => {
    filterParts.push(
      `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,` +
      `format=yuv420p,setsar=1[v${i}]`
    );
  });

  // Concat all slides (simple concatenation for now)
  const slideLabels = allSlides.map((_, i) => `[v${i}]`).join('');
  filterParts.push(`${slideLabels}concat=n=${allSlides.length}:v=1:a=0[vconcat]`);

  // Split concatenated video for end screen overlay
  // We need to apply end screen text only to the end screen portion
  const endScreenSlide = allSlides.find(s => s.isEndScreen);
  const endScreenIndex = allSlides.findIndex(s => s.isEndScreen);
  const contentDuration = endScreenSlide ? endScreenSlide.startTime : calculateDuration(allSlides);
  const endScreenDuration = endScreenSlide ? (endScreenSlide.endTime - endScreenSlide.startTime) : 0;

  let videoStream = '[vconcat]';

  // Add end screen text overlay if enabled
  if (project.endScreen.enabled && endScreenSlide && project.endScreen.type === 'text' && project.endScreen.content) {
    // Split video: content part and end screen part
    filterParts.push(`[vconcat]split=2[vcontent][vendscreen]`);
    
    // Trim content part (everything before end screen)
    if (contentDuration > 0) {
      filterParts.push(`[vcontent]trim=end=${contentDuration},setpts=PTS-STARTPTS[vcontentfinal]`);
    }
    
    // Trim end screen part and add text overlay
    filterParts.push(`[vendscreen]trim=start=${contentDuration},setpts=PTS-STARTPTS[vendtrim]`);
    
    // Write end screen text to file
    const endTextPath = path.join(workDir, 'endscreen_text.txt');
    fs.writeFileSync(endTextPath, project.endScreen.content, 'utf-8');
    const endTextFile = endTextPath
      .replace(/\\/g, '/')
      .replace(/:/g, '\\\\:')
      .replace(/ /g, '\\\\ ');
    
    // Add text overlay to end screen with logo if available
    if (logoInputIndex !== null && project.endScreen.logoUrl) {
      // Scale logo for end screen
      filterParts.push(`[${logoInputIndex}:v]scale=-1:120[endlogo]`);
      
      // Overlay logo at top left
      filterParts.push(`[vendtrim][endlogo]overlay=80:80[vendlogo]`);
      
      // Add business title at top center
      const titleTextPath = path.join(workDir, 'endscreen_title.txt');
      fs.writeFileSync(titleTextPath, project.business.title, 'utf-8');
      const titleTextFile = titleTextPath
        .replace(/\\/g, '/')
        .replace(/:/g, '\\\\:')
        .replace(/ /g, '\\\\ ');
      
      filterParts.push(
        `[vendlogo]drawtext=textfile=${titleTextFile}:fontsize=56:fontcolor=${project.endScreen.textColor}:` +
        `x=(w-text_w)/2:y=100[vendtitle]`
      );
      
      // Add main content text at center
      filterParts.push(
        `[vendtitle]drawtext=textfile=${endTextFile}:fontsize=48:fontcolor=${project.endScreen.textColor}:` +
        `x=(w-text_w)/2:y=(h-text_h)/2[vendfinal]`
      );
    } else {
      // No logo, just centered text
      filterParts.push(
        `[vendtrim]drawtext=textfile=${endTextFile}:fontsize=64:fontcolor=${project.endScreen.textColor}:` +
        `x=(w-text_w)/2:y=(h-text_h)/2[vendfinal]`
      );
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

  // Add banner overlay
  if (project.bottomBanner.enabled && project.bottomBanner.text) {
    const bannerHeight = 120;  // Increased height for better layout
    const y = project.bottomBanner.position === 'bottom' ? height - bannerHeight : 0;
    
    // Write text to file to avoid FFmpeg escaping issues
    const bannerTextPath = path.join(workDir, 'banner_text.txt');
    fs.writeFileSync(bannerTextPath, project.bottomBanner.text, 'utf-8');
    const bannerTextFile = bannerTextPath
      .replace(/\\/g, '/')
      .replace(/:/g, '\\\\:')
      .replace(/ /g, '\\\\ ');
    
    // Add logo if available (using logo input)
    if (logoInputIndex !== null && project.bottomBanner.logoUrl) {
      // Scale logo for banner (70px height)
      filterParts.push(`[${logoInputIndex}:v]scale=-1:70[bannerlogo]`);
      
      // Draw semi-transparent banner box on current video stream
      filterParts.push(
        `${videoStream}drawbox=x=0:y=${y}:w=${width}:h=${bannerHeight}:color=${project.bottomBanner.backgroundColor}@0.85:t=fill[vtemp1]`
      );
      
      // Overlay logo on left side with padding
      filterParts.push(
        `[vtemp1][bannerlogo]overlay=40:${y + 25}:shortest=1[vtemp2]`
      );
      
      // Add business name on left (next to logo) using textfile
      const bannerNamePath = path.join(workDir, 'banner_name.txt');
      fs.writeFileSync(bannerNamePath, project.business.title, 'utf-8');
      const bannerNameFile = bannerNamePath
        .replace(/\\/g, '/')
        .replace(/:/g, '\\\\:')
        .replace(/ /g, '\\\\ ');
      
      filterParts.push(
        `[vtemp2]drawtext=textfile=${bannerNameFile}:fontsize=28:fontcolor=${project.bottomBanner.textColor}:` +
        `x=140:y=${y + 25}[vtemp3]`
      );
      
      // Add phone/contact text on the right side (larger)
      filterParts.push(
        `[vtemp3]drawtext=textfile=${bannerTextFile}:fontsize=36:fontcolor=${project.bottomBanner.textColor}:` +
        `x=w-text_w-40:y=${y + (bannerHeight/2 - 18)}[vwithbanner]`
      );
    } else {
      // No logo, just draw box and centered text on current video stream
      filterParts.push(
        `${videoStream}drawbox=x=0:y=${y}:w=${width}:h=${bannerHeight}:color=${project.bottomBanner.backgroundColor}@0.85:t=fill,` +
        `drawtext=textfile=${bannerTextFile}:fontsize=${project.bottomBanner.fontSize}:fontcolor=${project.bottomBanner.textColor}:x=(w-text_w)/2:y=${y + bannerHeight/2}[vwithbanner]`
      );
    }
    
    videoStream = '[vwithbanner]';
  } else {
    // No banner, just pass through current stream
    filterParts.push(`${videoStream}copy[vwithbanner]`);
    videoStream = '[vwithbanner]';
  }

  // Add QR overlay
  if (qrInputIndex !== null && project.qrCode.enabled) {
    const padding = 20;
    let x = width - project.qrCode.size - padding;  // Default top-right
    let y = padding;  // Default top

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
    // top-right is default (x already set)
    
    filterParts.push(`[${qrInputIndex}:v]scale=${project.qrCode.size}:${project.qrCode.size}[qrscaled]`);
    filterParts.push(`${videoStream}[qrscaled]overlay=${x}:${y}:shortest=1[vout]`);
  } else {
    filterParts.push(`${videoStream}null[vout]`);
  }

  // Audio filter (use allSlides which already includes end screen)
  const totalDuration = calculateDuration(allSlides);
  
  const audioFilter = buildAudioFilter(
    project.music,
    project.voice,
    musicInputIndex,
    ttsInputIndex,
    totalDuration
  );

  if (audioFilter) {
    filterParts.push(audioFilter);
  } else {
    // Add silent audio track for proper duration metadata
    filterParts.push(`anullsrc=channel_layout=stereo:sample_rate=44100,atrim=duration=${totalDuration}[aout]`);
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
  // Disable expensive filters for faster encoding
  args.push('-tune', 'fastdecode');
  args.push('-threads', '0'); // Use all CPU cores

  args.push('-movflags', '+faststart');
  args.push('-y'); // Overwrite
  args.push(outputPath);

  console.log(`[VideoRenderer] FFmpeg command: ffmpeg ${args.join(' ')}`);

  // Execute FFmpeg
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', args);

    let stderr = '';
    let lastProgress = -1;
    let progressTimeout: NodeJS.Timeout;
    let lastProgressTime = Date.now();
    
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
        const progress = Math.min(95, 50 + Math.floor((currentTime / totalDuration) * 45));
        
        if (progress !== lastProgress) {
          lastProgress = progress;
          onProgress(progress, 'Rendering video');
          console.log(`[VideoRenderer] Progress: ${progress}% (${currentTime}s / ${totalDuration}s)`);
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
        reject(new Error(`FFmpeg exited with code ${code}. Check logs for details.`));
      }
    });

    ffmpeg.on('error', (err) => {
      if (progressTimeout) clearTimeout(progressTimeout);
      console.error('[VideoRenderer] FFmpeg spawn error:', err);
      reject(err);
    });
  });
}
