/**
 * Image processing and ranking utilities
 */

import { normalizeUrl } from './validation';

export interface ImageCandidate {
  url: string;
  typeGuess: 'logo' | 'hero' | 'product' | 'banner' | 'icon' | 'other';
  score: number;
  source: 'img' | 'og' | 'css' | 'icon' | 'srcset' | 'twitter';
}

/**
 * Score and rank images by their usefulness for video generation
 */
export function scoreImage(
  url: string,
  source: ImageCandidate['source'],
  alt: string = '',
  context: string = ''
): ImageCandidate {
  let score = 0.6; // Higher base score for better quality images
  let typeGuess: ImageCandidate['typeGuess'] = 'other';

  const urlLower = url.toLowerCase();
  const altLower = alt.toLowerCase();
  const contextLower = context.toLowerCase();

  // Hero/featured image (highest priority for larger images)
  if (
    source === 'og' ||
    source === 'twitter' ||
    urlLower.includes('hero') ||
    urlLower.includes('header') ||
    urlLower.includes('featured') ||
    urlLower.includes('main') ||
    altLower.includes('hero') ||
    altLower.includes('featured') ||
    contextLower.includes('hero') ||
    contextLower.includes('featured')
  ) {
    typeGuess = 'hero';
    score += 0.35;
  }

  // Product/service images
  if (
    urlLower.includes('product') ||
    urlLower.includes('service') ||
    urlLower.includes('screenshot') ||
    urlLower.includes('gallery') ||
    altLower.includes('product') ||
    altLower.includes('service')
  ) {
    typeGuess = typeGuess === 'other' ? 'product' : typeGuess;
    score += 0.3;
  }

  // Banner images
  if (urlLower.includes('banner') || altLower.includes('banner')) {
    typeGuess = typeGuess === 'other' ? 'banner' : typeGuess;
    score += 0.25;
  }

  // Logo detection (moderate priority)
  if (
    urlLower.includes('logo') ||
    altLower.includes('logo') ||
    contextLower.includes('logo')
  ) {
    typeGuess = typeGuess === 'other' ? 'logo' : typeGuess;
    score += 0.2;
  }

  // Icon detection (lower priority but don't penalize too much)
  if (
    urlLower.includes('icon') ||
    urlLower.includes('favicon') ||
    urlLower.includes('apple-touch') ||
    source === 'icon'
  ) {
    typeGuess = typeGuess === 'other' ? 'icon' : typeGuess;
    score -= 0.2; // Smaller penalty
  }

  // Penalty for tracking pixels and very small indicators
  if (
    urlLower.includes('track') ||
    urlLower.includes('pixel') ||
    urlLower.includes('1x1') ||
    urlLower.includes('beacon') ||
    urlLower.includes('gtm') ||
    urlLower.includes('analytics')
  ) {
    score -= 0.8; // Heavy penalty
  }

  // Penalty for very small images (common icon sizes and thumbnails)
  if (
    urlLower.match(/[-_](16|24|32|40|48|50)[-_x.]/) || // Very small icons
    urlLower.includes('spacer') ||
    urlLower.includes('blank') ||
    urlLower.includes('thumb') ||
    urlLower.match(/thumb[-_](sm|small|xs)/) ||
    urlLower.includes('_t.') || // Thumbnail suffix
    urlLower.includes('-t.') || // Thumbnail suffix
    urlLower.includes('_thumb') ||
    urlLower.includes('-thumb')
  ) {
    score -= 0.5;
  }

  // Bonus for large image indicators
  if (
    urlLower.includes('large') ||
    urlLower.includes('full') ||
    urlLower.includes('original') ||
    urlLower.includes('-xl') ||
    urlLower.includes('_xl') ||
    urlLower.match(/[-_](1200|1920|2000|2560|3000)/) // Large dimensions
  ) {
    score += 0.25;
  }

  // Bonus for high-quality formats
  if (urlLower.endsWith('.png') || urlLower.endsWith('.webp')) {
    score += 0.15;
  }

  // Strong bonus for OG/Twitter images (usually larger)
  if (source === 'og' || source === 'twitter') {
    score += 0.3;
  }

  // Bonus for images in srcset (usually higher quality variants)
  if (source === 'srcset') {
    score += 0.2;
  }

  // Cap score between 0 and 1
  score = Math.max(0, Math.min(1, score));

  return {
    url,
    typeGuess,
    score: Math.round(score * 100) / 100,
    source,
  };
}

/**
 * Filter out invalid or unwanted images
 */
export function filterImage(url: string): boolean {
  if (!url || url.length === 0) return false;

  const urlLower = url.toLowerCase();

  // Filter data URIs unless they're reasonable size (might be quality logos)
  if (url.startsWith('data:')) {
    return url.length < 5000; // Allow larger data URIs for quality logos
  }

  // Filter common tracking/analytics pixels
  if (
    urlLower.includes('google-analytics') ||
    urlLower.includes('facebook.com/tr') ||
    urlLower.includes('doubleclick') ||
    urlLower.includes('/pixel.') ||
    urlLower.includes('analytics') ||
    urlLower.includes('/beacon.') ||
    urlLower.includes('tracking')
  ) {
    return false;
  }

  // Filter very small dimensions in filename (1x1, 2x2 tracking pixels)
  if (
    urlLower.match(/[-_](1x1|2x2)[-_.]/) ||
    urlLower.includes('spacer.gif') ||
    urlLower.includes('blank.gif') ||
    urlLower.includes('transparent.gif')
  ) {
    return false;
  }

  // Filter sprite sheets
  if (urlLower.includes('sprite') && !urlLower.includes('hero')) {
    return false;
  }

  // Filter placeholder images
  if (
    urlLower.includes('placeholder') ||
    urlLower.includes('dummy') ||
    urlLower.includes('sample')
  ) {
    return false;
  }

  return true;
}

/**
 * Extract image URLs from srcset attribute
 */
export function parseSrcSet(srcset: string, baseUrl: string): string[] {
  if (!srcset) return [];

  const urls: string[] = [];
  const parts = srcset.split(',');

  for (const part of parts) {
    const trimmed = part.trim();
    const spaceIndex = trimmed.indexOf(' ');
    const url = spaceIndex > 0 ? trimmed.substring(0, spaceIndex) : trimmed;
    
    if (url) {
      const normalized = normalizeUrl(url, baseUrl);
      if (normalized && filterImage(normalized)) {
        urls.push(normalized);
      }
    }
  }

  return urls;
}

/**
 * Deduplicate images by URL
 */
export function deduplicateImages(images: ImageCandidate[]): ImageCandidate[] {
  const seen = new Set<string>();
  const unique: ImageCandidate[] = [];

  for (const img of images) {
    // Normalize URL for comparison: remove query params and fragments
    let normalized = img.url.split('?')[0].split('#')[0];
    
    // Also remove common CDN size/optimization parameters from path
    normalized = normalized.replace(/[-_](sm|md|lg|xl|small|medium|large|[0-9]+x[0-9]+)\.(jpg|jpeg|png|webp|gif)$/i, '.$2');
    
    if (!seen.has(normalized)) {
      seen.add(normalized);
      unique.push(img);
    }
  }

  console.log(`[Deduplicate] Reduced from ${images.length} to ${unique.length} unique images`);
  return unique;
}

/**
 * Sort images by score (highest first)
 */
export function sortImagesByScore(images: ImageCandidate[]): ImageCandidate[] {
  return [...images].sort((a, b) => {
    // First by score
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    // Then by type priority
    const typePriority: Record<ImageCandidate['typeGuess'], number> = {
      logo: 5,
      icon: 4,
      hero: 3,
      product: 2,
      banner: 1,
      other: 0,
    };
    return typePriority[b.typeGuess] - typePriority[a.typeGuess];
  });
}
