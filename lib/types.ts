/**
 * Shared types for the scraper
 */

export interface ScrapeResult {
  status: 'ok' | 'partial' | 'error';
  inputUrl: string;
  finalUrl: string;
  fetchedAt: string;
  business: BusinessInfo;
  brand: BrandInfo;
  images: ImageInfo[];
  debug: DebugInfo;
  error?: string;
  crawlStats?: CrawlStats; // Multi-page crawl statistics
}

export interface CrawlStats {
  pagesVisited: number;
  pagesSkipped: number;
  pagesFailed?: number;
  imagesFound: number;
  crawlTimeMs?: number;
}

export interface BusinessInfo {
  title: string;
  description: string;
  headings: string[];
  ctaTexts: string[];
  emails: string[];
  phones: string[];
  addresses: string[];
  socialLinks: SocialLinks;
}

export interface SocialLinks {
  linkedin: string[];
  instagram: string[];
  facebook: string[];
  x: string[];
  youtube: string[];
  tiktok: string[];
}

export interface BrandInfo {
  name: string;
  favicon: string;
  logoCandidates: string[];
  brandColors: BrandColor[];
}

export interface BrandColor {
  hex: string;
  source: 'cssVar' | 'inline' | 'stylesheet' | 'fallback';
}

export interface ImageInfo {
  url: string;
  typeGuess: 'logo' | 'hero' | 'product' | 'banner' | 'icon' | 'other';
  score: number;
  source: 'img' | 'og' | 'css' | 'icon' | 'srcset' | 'twitter';
  sourcePages?: string[]; // Pages where this image was found
  sourceTypes?: string[]; // Different source types across pages
}

export interface DebugInfo {
  methodUsed: 'static' | 'playwright' | 'both' | 'failed';
  timingsMs: Record<string, number>;
  notes: string[];
}
