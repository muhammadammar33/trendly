/**
 * Image downloader for slideshow generation
 * Downloads images from URLs to local filesystem
 */

import { fetch } from 'undici';
import fs from 'fs/promises';
import path from 'path';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const DOWNLOAD_TIMEOUT = 15000; // 15 seconds

export interface DownloadResult {
  downloaded: string[];
  failed: string[];
  warnings: string[];
}

/**
 * Download images to local filesystem
 */
export async function downloadImages(
  imageUrls: string[],
  jobId: string
): Promise<DownloadResult> {
  const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  const downloadDir = isServerless
    ? path.join('/tmp', 'slideshows', jobId, 'images')
    : path.join(process.cwd(), 'tmp', 'slideshows', jobId, 'images');
  
  // Create directory
  await fs.mkdir(downloadDir, { recursive: true });

  const downloaded: string[] = [];
  const failed: string[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i];
    const filename = `image-${i.toString().padStart(3, '0')}.jpg`;
    const filepath = path.join(downloadDir, filename);

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (!response.ok) {
        failed.push(url);
        warnings.push(`HTTP ${response.status} for ${url}`);
        continue;
      }

      // Validate content type
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.startsWith('image/')) {
        failed.push(url);
        warnings.push(`Invalid content-type: ${contentType} for ${url}`);
        continue;
      }

      // Check content length
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > MAX_FILE_SIZE) {
        failed.push(url);
        warnings.push(`Image too large (${contentLength} bytes): ${url}`);
        continue;
      }

      // Download file
      if (response.body) {
        const fileStream = createWriteStream(filepath);
        await pipeline(response.body as any, fileStream);
        downloaded.push(filepath);
      } else {
        failed.push(url);
        warnings.push(`No response body for ${url}`);
      }
    } catch (error: any) {
      failed.push(url);
      warnings.push(`Download failed for ${url}: ${error.message}`);
    }
  }

  return {
    downloaded,
    failed,
    warnings,
  };
}

/**
 * Clean up downloaded images
 */
export async function cleanupImages(jobId: string): Promise<void> {
  const jobDir = path.join(process.cwd(), 'tmp', 'slideshows', jobId);
  
  try {
    await fs.rm(jobDir, { recursive: true, force: true });
  } catch (error) {
    console.error(`Failed to cleanup job ${jobId}:`, error);
  }
}
