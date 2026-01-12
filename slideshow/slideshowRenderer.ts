/**
 * Slideshow renderer using FFmpeg
 * Creates MP4 slideshow from images
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

const OUTPUT_WIDTH = 1920;
const OUTPUT_HEIGHT = 1080;
const FPS = 30;

export interface RenderOptions {
  jobId: string;
  imagePaths: string[];
  durationSec: number;
  businessTitle?: string;
  websiteUrl?: string;
}

export interface RenderResult {
  success: boolean;
  videoPath?: string;
  error?: string;
}

/**
 * Render slideshow video using FFmpeg
 */
export async function renderSlideshow(options: RenderOptions): Promise<RenderResult> {
  const { jobId, imagePaths, durationSec, businessTitle, websiteUrl } = options;

  if (imagePaths.length === 0) {
    return {
      success: false,
      error: 'No images provided for slideshow',
    };
  }

  // Check if FFmpeg is available
  const ffmpegAvailable = await checkFFmpeg();
  if (!ffmpegAvailable) {
    return {
      success: false,
      error: 'FFmpeg is not installed or not in PATH. Please install FFmpeg first.',
    };
  }

  const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  const outputDir = isServerless
    ? path.join('/tmp', 'slideshows')
    : path.join(process.cwd(), 'public', 'slideshows');
  await fs.mkdir(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, `${jobId}.mp4`);
  const slideDuration = durationSec / imagePaths.length;

  try {
    // Create FFmpeg filter complex for slideshow with transitions
    const filterComplex = buildFilterComplex(imagePaths, slideDuration);

    // FFmpeg arguments
    const ffmpegArgs = [
      // Input images
      ...imagePaths.flatMap((img) => ['-loop', '1', '-t', slideDuration.toString(), '-i', img]),
      
      // Filter complex (transitions, scaling, Ken Burns effect)
      '-filter_complex',
      filterComplex,
      
      // Output settings
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-r', FPS.toString(),
      '-preset', 'medium',
      '-crf', '23',
      '-movflags', '+faststart',
      
      // Overwrite output
      '-y',
      outputPath,
    ];

    await runFFmpeg(ffmpegArgs);

    return {
      success: true,
      videoPath: `/slideshows/${jobId}.mp4`,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'FFmpeg rendering failed',
    };
  }
}

/**
 * Build FFmpeg filter complex for slideshow with transitions
 */
function buildFilterComplex(imagePaths: string[], slideDuration: number): string {
  const transitionDuration = 0.5; // 0.5 second crossfade
  const filters: string[] = [];

  // Scale and apply Ken Burns effect to each image
  imagePaths.forEach((_, index) => {
    const scale = `[${index}:v]scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=increase,crop=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}`;
    
    // Subtle zoom effect
    const zoom = `,zoompan=z='min(zoom+0.0015,1.1)':d=${slideDuration * FPS}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}`;
    
    filters.push(`${scale}${zoom}[v${index}]`);
  });

  // Create crossfade transitions between slides
  let output = '[v0]';
  for (let i = 1; i < imagePaths.length; i++) {
    const offset = (slideDuration * i) - transitionDuration;
    output = `${output}[v${i}]xfade=transition=fade:duration=${transitionDuration}:offset=${offset.toFixed(2)}`;
    if (i < imagePaths.length - 1) {
      output += `[vt${i}];[vt${i}]`;
    }
  }

  return `${filters.join(';')};${output},format=yuv420p`;
}

/**
 * Run FFmpeg command
 */
function runFFmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', args);

    let stderr = '';

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}\n${stderr}`));
      }
    });

    ffmpeg.on('error', (error) => {
      reject(new Error(`FFmpeg error: ${error.message}`));
    });
  });
}

/**
 * Check if FFmpeg is available
 */
async function checkFFmpeg(): Promise<boolean> {
  return new Promise((resolve) => {
    const ffmpeg = spawn('ffmpeg', ['-version']);

    ffmpeg.on('close', (code) => {
      resolve(code === 0);
    });

    ffmpeg.on('error', () => {
      resolve(false);
    });
  });
}
