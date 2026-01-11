/**
 * Image picker for slideshow generation
 * Selects best images from scraper output
 */

import type { ImageInfo } from '@/lib/types';

export interface PickedImages {
  selectedImages: string[];
  warnings: string[];
}

export interface PickerOptions {
  maxImages?: number;
  minImages?: number;
}

/**
 * Pick the best images for slideshow from scraper results
 */
export function pickImagesForSlideshow(
  images: ImageInfo[],
  options: PickerOptions = {}
): PickedImages {
  const maxImages = options.maxImages || 10;
  const minImages = options.minImages || 5;
  const warnings: string[] = [];

  if (!images || images.length === 0) {
    return {
      selectedImages: [],
      warnings: ['No images available from scraper'],
    };
  }

  // Sort by score (descending) and type priority
  const typePriority: Record<string, number> = {
    logo: 5,
    hero: 4,
    product: 3,
    banner: 2,
    icon: 1,
    other: 0,
  };

  const sorted = [...images].sort((a, b) => {
    // First by score
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    // Then by type priority
    return typePriority[b.typeGuess] - typePriority[a.typeGuess];
  });

  // Remove duplicates by domain and filename similarity
  const selected: string[] = [];
  const seenDomains = new Set<string>();
  const seenFilenames = new Set<string>();

  for (const img of sorted) {
    if (selected.length >= maxImages) break;

    try {
      const url = new URL(img.url);
      const domain = url.hostname;
      const filename = url.pathname.split('/').pop() || '';
      const baseFilename = filename.split('.')[0].toLowerCase();

      // Skip if we've seen very similar image from same domain
      const domainKey = `${domain}:${baseFilename}`;
      if (seenFilenames.has(domainKey)) {
        continue;
      }

      selected.push(img.url);
      seenDomains.add(domain);
      seenFilenames.add(domainKey);
    } catch (e) {
      // Invalid URL, skip
      warnings.push(`Skipped invalid URL: ${img.url}`);
    }
  }

  // Ensure minimum images by duplicating best ones if needed
  if (selected.length < minImages && selected.length > 0) {
    warnings.push(
      `Only ${selected.length} unique images found. Duplicating to reach ${minImages} slides.`
    );

    const originalCount = selected.length;
    while (selected.length < minImages) {
      const index = selected.length % originalCount;
      selected.push(selected[index]);
    }
  }

  if (selected.length === 0) {
    warnings.push('Could not select any valid images for slideshow');
  }

  return {
    selectedImages: selected,
    warnings,
  };
}
