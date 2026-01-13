/**
 * Smart Image Selector with Aspect Ratio Intelligence
 * Prioritizes images closest to 16:9 for optimal video framing
 */

import { ImageInfo } from '@/lib/types';
import { fetch as undiciFetch } from 'undici';
import sharp from 'sharp';

const TARGET_ASPECT_RATIO = 16 / 9; // 1.777...
const IDEAL_RANGE = { min: 1.6, max: 1.9 };
const ACCEPTABLE_RANGE = { min: 1.4, max: 2.0 };

interface ImageWithDimensions extends ImageInfo {
  width?: number;
  height?: number;
  aspectRatio?: number;
  aspectScore?: number;
  totalScore?: number;
}

/**
 * Fetch image dimensions from URL
 */
async function getImageDimensions(url: string): Promise<{ width: number; height: number } | null> {
  try {
    const response = await undiciFetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(5000), // 5s timeout per image
    });

    if (!response.ok) {
      console.warn(`[ImageSelector] Failed to fetch ${url}: ${response.status}`);
      return null;
    }

    const buffer = await response.arrayBuffer();
    const metadata = await sharp(Buffer.from(buffer)).metadata();

    if (metadata.width && metadata.height) {
      return { width: metadata.width, height: metadata.height };
    }

    return null;
  } catch (error) {
    console.warn(`[ImageSelector] Error getting dimensions for ${url}:`, error);
    return null;
  }
}

/**
 * Score image based on aspect ratio closeness to 16:9
 */
function scoreAspectRatio(aspectRatio: number): number {
  const diff = Math.abs(aspectRatio - TARGET_ASPECT_RATIO);

  // Ideal range: 1.6 - 1.9
  if (aspectRatio >= IDEAL_RANGE.min && aspectRatio <= IDEAL_RANGE.max) {
    // Perfect score for ideal range, higher for closer to exact 16:9
    const idealScore = 1.0 - (diff / 0.15); // 0.15 is half the ideal range
    return Math.max(0.8, Math.min(1.0, idealScore));
  }

  // Acceptable range: 1.4 - 2.0
  if (aspectRatio >= ACCEPTABLE_RANGE.min && aspectRatio <= ACCEPTABLE_RANGE.max) {
    // Decent score for acceptable range
    return 0.5 + (0.3 * (1 - diff / 0.4));
  }

  // Outside acceptable range - penalize heavily
  return Math.max(0.1, 0.5 - diff);
}

/**
 * Calculate total score combining aspect ratio, resolution, and existing score
 */
function calculateTotalScore(image: ImageWithDimensions): number {
  let score = 0;

  // 1. Aspect ratio score (60% weight - HIGHEST PRIORITY)
  if (image.aspectScore !== undefined) {
    score += image.aspectScore * 0.6;
  }

  // 2. Resolution score (20% weight)
  if (image.width && image.height) {
    const pixels = image.width * image.height;
    // Prefer 1080p+ (2M pixels), penalize below 720p (1M pixels)
    const resolutionScore = Math.min(1.0, pixels / 2000000); // 2M pixels = full score
    score += resolutionScore * 0.2;
  }

  // 3. Existing scraper score (15% weight)
  score += (image.score || 0.5) * 0.15;

  // 4. Image type bonus (5% weight)
  const typeBonus: Record<string, number> = {
    'hero': 0.05,
    'product': 0.04,
    'banner': 0.03,
    'logo': 0.02,
    'other': 0.01,
    'icon': 0,
  };
  score += typeBonus[image.typeGuess] || 0;

  return Math.min(1.0, score);
}

/**
 * Smart select exactly 4 images optimized for 16:9 video
 */
export async function selectBest4ImagesFor16x9(
  images: ImageInfo[]
): Promise<ImageInfo[]> {
  console.log(`[ImageSelector] Starting smart selection from ${images.length} images`);

  // Filter valid images first
  const validImages = images.filter(img => {
    if (!img.url || img.url.length === 0) return false;
    if (img.typeGuess === 'icon') return false;
    if (img.score < 0.5) return false;
    
    try {
      new URL(img.url);
      return true;
    } catch {
      return false;
    }
  });

  console.log(`[ImageSelector] ${validImages.length} valid images after filtering`);

  if (validImages.length === 0) {
    throw new Error('No valid images found for selection');
  }

  // Fetch dimensions in parallel (with concurrency limit)
  const BATCH_SIZE = 5;
  const imagesWithDimensions: ImageWithDimensions[] = [];

  for (let i = 0; i < validImages.length; i += BATCH_SIZE) {
    const batch = validImages.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (img): Promise<ImageWithDimensions> => {
        const dimensions = await getImageDimensions(img.url);
        
        if (dimensions) {
          const aspectRatio = dimensions.width / dimensions.height;
          const aspectScore = scoreAspectRatio(aspectRatio);
          
          return {
            ...img,
            width: dimensions.width,
            height: dimensions.height,
            aspectRatio,
            aspectScore,
          };
        }
        
        // Fallback: no dimensions, use only scraper score
        return {
          ...img,
          aspectScore: 0.3, // Low score if we can't fetch dimensions
        };
      })
    );

    results.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        imagesWithDimensions.push(result.value);
      } else {
        // If dimension fetch failed completely, include with low score
        imagesWithDimensions.push({
          ...batch[idx],
          aspectScore: 0.2,
        });
      }
    });

    // Log progress
    console.log(`[ImageSelector] Processed ${Math.min(i + BATCH_SIZE, validImages.length)}/${validImages.length} images`);
  }

  // Calculate total scores
  imagesWithDimensions.forEach(img => {
    img.totalScore = calculateTotalScore(img);
  });

  // Sort by total score (descending)
  const sorted = imagesWithDimensions.sort((a, b) => 
    (b.totalScore || 0) - (a.totalScore || 0)
  );

  // Log top candidates
  console.log('[ImageSelector] Top 10 candidates:');
  sorted.slice(0, 10).forEach((img, idx) => {
    console.log(
      `  ${idx + 1}. ${img.typeGuess} | ` +
      `AR: ${img.aspectRatio?.toFixed(2) || 'unknown'} | ` +
      `Dim: ${img.width}x${img.height || 'unknown'} | ` +
      `Score: ${img.totalScore?.toFixed(3)} | ` +
      `URL: ${img.url.substring(0, 60)}...`
    );
  });

  // Select exactly 4 images
  const selected = sorted.slice(0, 4);

  // If we have fewer than 4, fill with lower-scored images
  if (selected.length < 4) {
    console.warn(`[ImageSelector] Only found ${selected.length} images, expected 4`);
    
    // Try to fill remaining slots with any remaining valid images
    const remaining = validImages.filter(
      img => !selected.find(s => s.url === img.url)
    ).slice(0, 4 - selected.length);
    
    selected.push(...remaining);
  }

  console.log(`[ImageSelector] Final selection: ${selected.length} images`);
  selected.forEach((img, idx) => {
    console.log(
      `  ${idx + 1}. ${img.typeGuess} | ` +
      `AR: ${img.aspectRatio?.toFixed(2) || 'N/A'} | ` +
      `${img.width}x${img.height || 'N/A'} | ` +
      `Total: ${img.totalScore?.toFixed(3)}`
    );
  });

  // Return as plain ImageInfo (strip extra fields)
  return selected.map(({ url, typeGuess, score, source }) => ({
    url,
    typeGuess,
    score,
    source,
  }));
}

/**
 * Generate config hash for detecting changes
 * Must match client-side implementation in StudioModal
 */
export function generateConfigHash(project: {
  slides: Array<{ imageUrl: string; startTime: number; endTime: number; transition?: string }>;
  bottomBanner: { enabled: boolean; text: string; logoUrl: string | null; backgroundColor: string };
  qrCode: { enabled: boolean; url: string };
  music: { enabled: boolean; fileName: string | null };
  voice: { enabled: boolean; script: string };
  endScreen: { enabled: boolean; content: string };
}): string {
  const config = {
    slides: project.slides.map(s => ({
      url: s.imageUrl,
      start: s.startTime,
      end: s.endTime,
      transition: s.transition,
    })),
    banner: project.bottomBanner.enabled ? {
      text: project.bottomBanner.text,
      logo: project.bottomBanner.logoUrl,
      color: project.bottomBanner.backgroundColor,
    } : null,
    qr: project.qrCode.enabled ? project.qrCode.url : null,
    music: project.music.enabled ? project.music.fileName : null,
    voice: project.voice.enabled ? project.voice.script : null,
    endScreen: project.endScreen.enabled ? project.endScreen.content : null,
  };

  // Simple hash using JSON stringify + base64
  const json = JSON.stringify(config);
  return Buffer.from(json).toString('base64').substring(0, 32);
}
