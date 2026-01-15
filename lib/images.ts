/**
 * Image processing and ranking utilities
 */

import { normalizeUrl } from './validation';

export interface ImageCandidate {
  url: string;
  typeGuess: 'logo' | 'hero' | 'product' | 'banner' | 'icon' | 'other';
  score: number;
  source: 'img' | 'og' | 'css' | 'icon' | 'srcset' | 'twitter';
  sourcePage?: string; // Page where this image was found
}

/**
 * Validate if a URL is likely to be a valid image URL
 */
export function isValidImageUrl(url: string): boolean {
  if (!url || url.length === 0) return false;
  
  try {
    // Must be a valid URL
    const parsed = new URL(url);
    
    // Must be http or https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }
    
    // Check the pathname
    const pathname = parsed.pathname.toLowerCase();
    
    // Reject malformed CDN URLs with transformation parameters in the middle of the path
    // e.g., /path/c_fill/v12345/image.jpg or /path/c_scale/image.jpg
    const hasMalformedCDNPath = /\/(c_fill|c_scale|c_fit|c_crop|c_thumb|c_pad|w_\d+|h_\d+|q_\d+|f_auto|dpr_\d+)\//i.test(pathname);
    if (hasMalformedCDNPath) {
      console.warn(`[ImageValidator] Rejected malformed CDN URL: ${url}`);
      return false;
    }
    
    // Reject URLs with multiple transformation parameters scattered in path
    // These are often incorrectly parsed from data attributes or CSS
    const transformCount = (pathname.match(/\/(c_|w_|h_|q_|f_|dpr_|ar_|g_|x_|y_)/gi) || []).length;
    if (transformCount > 0) {
      console.warn(`[ImageValidator] Rejected URL with transformation params in path: ${url}`);
      return false;
    }
    
    // Must have a valid image extension or be from a known CDN/image service
    const hasExtension = /\.(jpg|jpeg|png|gif|webp|bmp|svg|avif|ico)$/i.test(pathname);
    const hasImageParam = /[?&](format|ext|fm)=(jpg|jpeg|png|gif|webp|bmp|svg|avif)/i.test(url);
    const isImagePath = /\/(image|img|photo|picture|media|gallery|upload|cdn|static|assets)\//i.test(pathname);
    
    // Valid if it has extension, image params, or is from an image path
    return hasExtension || hasImageParam || isImagePath;
  } catch {
    // Invalid URL format
    return false;
  }
}

/**
 * Score and rank images by their usefulness for video generation
 */
export function scoreImage(
  url: string,
  source: ImageCandidate['source'],
  alt: string = '',
  context: string = '',
  sourcePage?: string
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
    sourcePage,
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

  // Validate URL has proper image extension or is a valid image endpoint
  // Remove query params and fragments to check the base path
  const urlWithoutParams = url.split('?')[0].split('#')[0];
  const hasValidExtension = /\.(jpg|jpeg|png|gif|webp|bmp|svg|avif|ico)$/i.test(urlWithoutParams);
  const hasImageParams = /[?&](format|ext|fm)=(jpg|jpeg|png|gif|webp|bmp|svg|avif)/i.test(url);
  
  // Must have either a valid extension OR image format parameters (for CDN URLs)
  // Also allow URLs that contain common image path indicators
  const looksLikeImage = hasValidExtension || 
                         hasImageParams || 
                         /\/(image|img|photo|picture|media|gallery|upload|cdn|static)\/.*\.(jpg|jpeg|png|gif|webp)/i.test(urlLower);
  
  if (!looksLikeImage) {
    // Filter out incomplete/invalid URLs like CDN transformation paths without extensions
    // e.g., https://example.com/c_fill/image_name (missing extension)
    return false;
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

/**
 * Aggregate images from multiple pages, tracking which pages they appear on
 */
export function aggregateImagesFromPages(
  pagesImages: ImageCandidate[][],
  pageUrls: string[],
  homepageUrl: string
): ImageCandidate[] {
  const imageMap = new Map<string, {
    candidate: ImageCandidate;
    pages: Set<string>;
    sources: Set<string>;
    totalScore: number;
    occurrences: number;
  }>();

  // Aggregate all images
  for (let i = 0; i < pagesImages.length; i++) {
    const images = pagesImages[i];
    const pageUrl = pageUrls[i];

    for (const img of images) {
      // Normalize URL for deduplication
      const normalized = img.url.split('?')[0].split('#')[0];

      if (!imageMap.has(normalized)) {
        imageMap.set(normalized, {
          candidate: { ...img },
          pages: new Set([pageUrl]),
          sources: new Set([img.source]),
          totalScore: img.score,
          occurrences: 1,
        });
      } else {
        const existing = imageMap.get(normalized)!;
        existing.pages.add(pageUrl);
        existing.sources.add(img.source);
        existing.totalScore += img.score;
        existing.occurrences++;

        // Update type guess if we found a better one
        if (img.score > existing.candidate.score) {
          existing.candidate.typeGuess = img.typeGuess;
        }
      }
    }
  }

  // Convert map to array and boost scores for images found on multiple pages
  const aggregated: ImageCandidate[] = [];

  for (const [url, data] of imageMap.entries()) {
    let finalScore = data.totalScore / data.occurrences; // Average score

    // Boost if found on multiple pages
    if (data.occurrences > 1) {
      finalScore += 0.1 * Math.min(data.occurrences - 1, 5); // Up to +0.5 bonus
    }

    // Boost if found on homepage
    if (data.pages.has(homepageUrl)) {
      finalScore += 0.15;
    }

    // Cap at 1.0
    finalScore = Math.min(1, finalScore);
    finalScore = Math.round(finalScore * 100) / 100;

    aggregated.push({
      url: data.candidate.url,
      typeGuess: data.candidate.typeGuess,
      score: finalScore,
      source: data.candidate.source,
      sourcePage: data.pages.size === 1 ? (Array.from(data.pages)[0] as string) : undefined,
    });
  }

  console.log(`[AggregateImages] Aggregated ${aggregated.length} unique images from ${pagesImages.length} pages`);
  return aggregated;
}

