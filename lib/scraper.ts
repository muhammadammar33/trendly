/**
 * Main scraper orchestrator
 */

import { fetch as undiciFetch } from 'undici';
import { parseStaticHtml, parseMultiplePages } from './parser';
import { scrapeWithPlaywright, shouldUsePlaywright } from './playwright';
import { validateUrl } from './validation';
import { crawlWebsite, CrawlOptions } from './crawler';
import type { ScrapeResult } from './types';

const MAX_RESPONSE_SIZE = parseInt(process.env.MAX_RESPONSE_SIZE || '10485760', 10); // 10MB
const REQUEST_TIMEOUT = parseInt(process.env.REQUEST_TIMEOUT_MS || '30000', 10); // 30s

export interface ScrapeOptions {
  enableCrawling?: boolean; // Enable multi-page crawling
  crawlOptions?: CrawlOptions; // Crawler configuration
}

/**
 * Main scraping function - tries static first, falls back to Playwright if needed
 * Now supports multi-page crawling when enableCrawling is true
 */
export async function scrapeWebsite(
  inputUrl: string,
  options: ScrapeOptions = {}
): Promise<ScrapeResult> {
  const startTime = Date.now();

  // Validate URL
  const validation = validateUrl(inputUrl);
  if (!validation.valid) {
    return {
      status: 'error',
      inputUrl,
      finalUrl: inputUrl,
      fetchedAt: new Date().toISOString(),
      business: {
        title: '',
        description: '',
        headings: [],
        ctaTexts: [],
        emails: [],
        phones: [],
        addresses: [],
        socialLinks: {
          linkedin: [],
          instagram: [],
          facebook: [],
          x: [],
          youtube: [],
          tiktok: [],
        },
      },
      brand: {
        name: '',
        favicon: '',
        logoCandidates: [],
        brandColors: [],
      },
      images: [],
      debug: {
        methodUsed: 'failed',
        timingsMs: { total: 0 },
        notes: [],
      },
      error: validation.error,
    };
  }

  const normalizedUrl = validation.normalizedUrl!;

  try {
    // Multi-page crawling mode
    if (options.enableCrawling) {
      console.log('[Scraper] Multi-page crawling enabled');
      
      const crawlResult = await crawlWebsite(normalizedUrl, options.crawlOptions);
      
      if (crawlResult.pages.length === 0) {
        throw new Error('No pages were successfully crawled');
      }

      // Filter successful pages
      const successfulPages = crawlResult.pages
        .filter(p => p.success)
        .map(p => ({ url: p.url, html: p.html }));

      if (successfulPages.length === 0) {
        throw new Error('All pages failed to load');
      }

      console.log(`[Scraper] Successfully crawled ${successfulPages.length} pages`);

      // Parse all pages
      const result = await parseMultiplePages(
        successfulPages,
        inputUrl,
        crawlResult.stats
      );

      return {
        ...result,
        debug: {
          ...result.debug!,
          timingsMs: {
            ...result.debug!.timingsMs,
            crawl: crawlResult.stats.crawlTimeMs || 0,
            total: Date.now() - startTime,
          },
        },
      } as ScrapeResult;
    }

    // Single-page mode (original behavior)
    // Try static fetch first
    const fetchStart = Date.now();
    const response = await undiciFetch(normalizedUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Check content type
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      throw new Error(`Invalid content type: ${contentType}`);
    }

    // Check content length
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
      throw new Error('Response too large');
    }

    const html = await response.text();
    const fetchTime = Date.now() - fetchStart;

    // Check if we should use Playwright
    if (shouldUsePlaywright(html)) {
      console.log('Detected SPA/JS-heavy site, using Playwright...');
      
      const playwrightResult = await scrapeWithPlaywright(normalizedUrl, inputUrl);
      
      // If Playwright fails, fall back to static parse
      if (playwrightResult.status === 'error') {
        console.log('Playwright failed, falling back to static parse...');
        
        const staticResult = await parseStaticHtml({
          html,
          finalUrl: normalizedUrl,
          inputUrl,
        });

        return {
          ...staticResult,
          status: 'partial',
          debug: {
            ...staticResult.debug!,
            methodUsed: 'both',
            notes: [
              ...staticResult.debug!.notes,
              'Playwright failed, used static parse as fallback',
            ],
          },
        } as ScrapeResult;
      }

      return playwrightResult as ScrapeResult;
    }

    // Use static parsing
    const parseStart = Date.now();
    const result = await parseStaticHtml({
      html,
      finalUrl: normalizedUrl,
      inputUrl,
    });

    const parseTime = Date.now() - parseStart;

    return {
      ...result,
      debug: {
        ...result.debug!,
        timingsMs: {
          fetch: fetchTime,
          parse: parseTime,
          total: Date.now() - startTime,
        },
      },
    } as ScrapeResult;
  } catch (error: any) {
    console.error('Scraping error:', error);

    // Try Playwright as last resort (only in single-page mode)
    if (!options.enableCrawling) {
      try {
        console.log('Static fetch failed, trying Playwright...');
        const playwrightResult = await scrapeWithPlaywright(normalizedUrl, inputUrl);
        
        if (playwrightResult.status !== 'error') {
          return {
            ...playwrightResult,
            status: 'partial',
            debug: {
              ...playwrightResult.debug!,
              notes: [
                ...playwrightResult.debug!.notes,
                'Static fetch failed, used Playwright as fallback',
              ],
            },
          } as ScrapeResult;
        }
      } catch (playwrightError) {
        console.error('Playwright fallback also failed:', playwrightError);
      }
    }

    return {
      status: 'error',
      inputUrl,
      finalUrl: normalizedUrl,
      fetchedAt: new Date().toISOString(),
      business: {
        title: '',
        description: '',
        headings: [],
        ctaTexts: [],
        emails: [],
        phones: [],
        addresses: [],
        socialLinks: {
          linkedin: [],
          instagram: [],
          facebook: [],
          x: [],
          youtube: [],
          tiktok: [],
        },
      },
      brand: {
        name: '',
        favicon: '',
        logoCandidates: [],
        brandColors: [],
      },
      images: [],
      debug: {
        methodUsed: 'failed',
        timingsMs: { total: Date.now() - startTime },
        notes: [error.message || 'Unknown error'],
      },
      error: error.message || 'Failed to scrape website',
    };
  }
}
