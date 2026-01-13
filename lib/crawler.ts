/**
 * Web crawler for multi-page scraping
 * Implements BFS-based crawling with domain restrictions and safety limits
 */

import { fetch as undiciFetch } from 'undici';
import * as cheerio from 'cheerio';
import { normalizeUrl } from './validation';

export interface CrawlOptions {
  maxPages?: number;
  maxDepth?: number;
  requestTimeout?: number;
  concurrency?: number;
  includeSubdomains?: boolean;
  totalCrawlTimeout?: number;
}

export interface CrawledPage {
  url: string;
  depth: number;
  html: string;
  success: boolean;
  error?: string;
}

export interface InternalCrawlStats {
  pagesVisited: number;
  pagesSkipped: number;
  pagesFailed: number;
  crawlTimeMs: number;
}

const DEFAULT_OPTIONS: Required<CrawlOptions> = {
  maxPages: 30,
  maxDepth: 3,
  requestTimeout: 10000, // 10s per request
  concurrency: 3,
  includeSubdomains: false,
  totalCrawlTimeout: 30000, // 30s total
};

// Blocked file extensions
const BLOCKED_EXTENSIONS = new Set([
  '.pdf', '.zip', '.tar', '.gz', '.rar', '.7z',
  '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm',
  '.mp3', '.wav', '.ogg', '.flac',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.exe', '.dmg', '.pkg', '.deb', '.rpm',
  '.iso', '.img',
]);

// Blocked domains (social media, tracking, etc.)
const BLOCKED_DOMAINS = new Set([
  'facebook.com', 'twitter.com', 'x.com', 'instagram.com', 'linkedin.com',
  'youtube.com', 'tiktok.com', 'pinterest.com', 'reddit.com',
  'google.com', 'bing.com', 'yahoo.com',
  'doubleclick.net', 'google-analytics.com', 'googletagmanager.com',
  'facebook.net', 'twitter.net',
]);

/**
 * Main crawler function - crawls website using BFS
 */
export async function crawlWebsite(
  startUrl: string,
  options: CrawlOptions = {}
): Promise<{ pages: CrawledPage[]; stats: InternalCrawlStats }> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();

  const startUrlObj = new URL(startUrl);
  const baseDomain = getDomain(startUrlObj, opts.includeSubdomains);

  const visitedUrls = new Set<string>();
  const queuedUrls = new Set<string>();
  const queue: { url: string; depth: number }[] = [{ url: startUrl, depth: 0 }];
  const pages: CrawledPage[] = [];
  const stats: InternalCrawlStats = {
    pagesVisited: 0,
    pagesSkipped: 0,
    pagesFailed: 0,
    crawlTimeMs: 0,
  };

  queuedUrls.add(normalizeUrlForComparison(startUrl));

  console.log(`[Crawler] Starting crawl from ${startUrl}`);
  console.log(`[Crawler] Max pages: ${opts.maxPages}, Max depth: ${opts.maxDepth}`);

  // Process queue with concurrency control
  while (queue.length > 0 && pages.length < opts.maxPages) {
    // Check total timeout
    if (Date.now() - startTime > opts.totalCrawlTimeout) {
      console.log(`[Crawler] Total timeout reached (${opts.totalCrawlTimeout}ms)`);
      break;
    }

    // Process batch of pages concurrently
    const batch = queue.splice(0, opts.concurrency);
    const batchPromises = batch.map((item) =>
      crawlPage(item.url, item.depth, startUrlObj, baseDomain, opts, visitedUrls)
    );

    const batchResults = await Promise.allSettled(batchPromises);

    for (let i = 0; i < batchResults.length; i++) {
      const result = batchResults[i];
      const item = batch[i];

      if (result.status === 'fulfilled' && result.value) {
        const crawledPage = result.value;
        pages.push(crawledPage);
        stats.pagesVisited++;

        if (crawledPage.success) {
          console.log(`[Crawler] ✓ Crawled (depth ${item.depth}): ${item.url}`);

          // Extract links if we haven't reached max depth
          if (item.depth < opts.maxDepth && pages.length < opts.maxPages) {
            const newLinks = extractLinks(crawledPage.html, item.url, startUrlObj, baseDomain, opts);

            for (const link of newLinks) {
              const normalized = normalizeUrlForComparison(link);
              if (!visitedUrls.has(normalized) && !queuedUrls.has(normalized)) {
                queue.push({ url: link, depth: item.depth + 1 });
                queuedUrls.add(normalized);
              }
            }
          }
        } else {
          console.log(`[Crawler] ✗ Failed: ${item.url} - ${crawledPage.error}`);
          stats.pagesFailed++;
        }
      } else {
        console.log(`[Crawler] ✗ Exception: ${item.url}`);
        stats.pagesFailed++;
      }
    }
  }

  stats.crawlTimeMs = Date.now() - startTime;
  stats.pagesSkipped = queuedUrls.size - visitedUrls.size;

  console.log(`[Crawler] Completed: ${stats.pagesVisited} visited, ${stats.pagesFailed} failed, ${stats.pagesSkipped} skipped`);

  return { pages, stats };
}

/**
 * Crawl a single page
 */
async function crawlPage(
  url: string,
  depth: number,
  startUrlObj: URL,
  baseDomain: string,
  opts: Required<CrawlOptions>,
  visitedUrls: Set<string>
): Promise<CrawledPage | null> {
  const normalized = normalizeUrlForComparison(url);

  // Check if already visited
  if (visitedUrls.has(normalized)) {
    return null;
  }

  visitedUrls.add(normalized);

  try {
    const response = await undiciFetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(opts.requestTimeout),
    });

    if (!response.ok) {
      return {
        url,
        depth,
        html: '',
        success: false,
        error: `HTTP ${response.status}`,
      };
    }

    // Check content type
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return {
        url,
        depth,
        html: '',
        success: false,
        error: `Invalid content type: ${contentType}`,
      };
    }

    const html = await response.text();

    return {
      url,
      depth,
      html,
      success: true,
    };
  } catch (error: any) {
    return {
      url,
      depth,
      html: '',
      success: false,
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * Extract internal links from HTML
 */
function extractLinks(
  html: string,
  pageUrl: string,
  startUrlObj: URL,
  baseDomain: string,
  opts: Required<CrawlOptions>
): string[] {
  const $ = cheerio.load(html);
  const links = new Set<string>();

  // Extract from <a> tags
  $('a[href]').each((_, elem) => {
    const href = $(elem).attr('href');
    if (href) {
      processLink(href, pageUrl, startUrlObj, baseDomain, opts, links);
    }
  });

  // Extract from canonical link
  const canonical = $('link[rel="canonical"]').attr('href');
  if (canonical) {
    processLink(canonical, pageUrl, startUrlObj, baseDomain, opts, links);
  }

  return Array.from(links);
}

/**
 * Process and validate a link
 */
function processLink(
  href: string,
  pageUrl: string,
  startUrlObj: URL,
  baseDomain: string,
  opts: Required<CrawlOptions>,
  links: Set<string>
): void {
  // Skip empty, hash-only, mailto, tel, javascript
  if (
    !href ||
    href.trim().length === 0 ||
    href.startsWith('#') ||
    href.startsWith('mailto:') ||
    href.startsWith('tel:') ||
    href.startsWith('javascript:') ||
    href.startsWith('data:')
  ) {
    return;
  }

  try {
    // Normalize to absolute URL
    const absoluteUrl = normalizeUrl(href, pageUrl);
    if (!absoluteUrl) return;

    const urlObj = new URL(absoluteUrl);

    // Check if same domain
    const linkDomain = getDomain(urlObj, opts.includeSubdomains);
    if (linkDomain !== baseDomain) {
      return;
    }

    // Check if blocked domain
    if (isBlockedDomain(urlObj.hostname)) {
      return;
    }

    // Check file extension
    const pathname = urlObj.pathname.toLowerCase();
    for (const ext of BLOCKED_EXTENSIONS) {
      if (pathname.endsWith(ext)) {
        return;
      }
    }

    // Remove hash fragments for crawling (but keep query params for now)
    urlObj.hash = '';
    const cleanUrl = urlObj.href;

    links.add(cleanUrl);
  } catch (e) {
    // Invalid URL, skip
  }
}

/**
 * Get domain for comparison (with or without subdomain)
 */
function getDomain(urlObj: URL, includeSubdomains: boolean): string {
  if (includeSubdomains) {
    return `${urlObj.protocol}//${urlObj.hostname}`;
  }

  // Extract root domain (e.g., example.com from www.example.com)
  const parts = urlObj.hostname.split('.');
  if (parts.length >= 2) {
    const rootDomain = parts.slice(-2).join('.');
    return `${urlObj.protocol}//${rootDomain}`;
  }

  return `${urlObj.protocol}//${urlObj.hostname}`;
}

/**
 * Normalize URL for comparison (remove query params and hash)
 */
function normalizeUrlForComparison(url: string): string {
  try {
    const urlObj = new URL(url);
    // Keep protocol, hostname, and pathname only
    return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
  } catch (e) {
    return url;
  }
}

/**
 * Check if domain is blocked
 */
function isBlockedDomain(hostname: string): boolean {
  const lower = hostname.toLowerCase();

  // Check exact match or subdomain
  for (const blocked of BLOCKED_DOMAINS) {
    if (lower === blocked || lower.endsWith(`.${blocked}`)) {
      return true;
    }
  }

  return false;
}
