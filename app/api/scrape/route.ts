/**
 * API Route: /api/scrape
 * Handles website scraping requests with caching
 */

import { NextRequest, NextResponse } from 'next/server';
import { LRUCache } from 'lru-cache';
import { scrapeWebsite } from '@/lib/scraper';
import type { ScrapeResult } from '@/lib/types';

// Configure LRU cache
const CACHE_TTL_MS = parseInt(process.env.CACHE_TTL_MS || '600000', 10); // 10 minutes
const cache = new LRUCache<string, ScrapeResult>({
  max: 100,
  ttl: CACHE_TTL_MS,
  updateAgeOnGet: false,
});

export const maxDuration = 60; // 60 seconds for Vercel
export const dynamic = 'force-dynamic';

/**
 * POST /api/scrape
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();
    const { url, enableCrawling, crawlOptions } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        {
          status: 'error',
          error: 'URL is required and must be a string',
        },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      const urlObj = new URL(url.trim());
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return NextResponse.json(
          {
            status: 'error',
            error: 'Invalid URL protocol. Only HTTP and HTTPS are supported.',
          },
          { status: 400 }
        );
      }
    } catch (e) {
      return NextResponse.json(
        {
          status: 'error',
          error: 'Invalid URL format. Please enter a valid website URL (e.g., https://example.com)',
        },
        { status: 400 }
      );
    }

    // Check cache (include crawling option in cache key)
    const cacheKey = `${url.trim().toLowerCase()}:${enableCrawling ? 'crawl' : 'single'}`;
    const cached = cache.get(cacheKey);
    
    if (cached) {
      console.log(`[Scrape API] Cache hit for ${url}`);
      return NextResponse.json({
        ...cached,
        debug: {
          ...cached.debug,
          notes: [...cached.debug.notes, 'Served from cache'],
        },
      });
    }

    // Scrape the website
    const mode = enableCrawling ? 'multi-page crawl' : 'single page';
    console.log(`[Scrape API] Scraping ${url} (${mode})...`);
    
    const result = await scrapeWebsite(url, {
      enableCrawling: enableCrawling || false,
      crawlOptions: crawlOptions || {},
    });

    // Cache successful or partial results
    if (result.status === 'ok' || result.status === 'partial') {
      cache.set(cacheKey, result);
    }

    // Return result
    const statusCode = result.status === 'error' ? 500 : 200;
    return NextResponse.json(result, { status: statusCode });
  } catch (error: any) {
    console.error('API error:', error);
    
    return NextResponse.json(
      {
        status: 'error',
        error: error.message || 'Internal server error',
        debug: {
          methodUsed: 'failed',
          timingsMs: {},
          notes: [error.message],
        },
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/scrape (for testing)
 */
export async function GET() {
  return NextResponse.json({
    message: 'Web Scraper API',
    usage: 'POST /api/scrape with JSON body: { "url": "https://example.com", "enableCrawling": false }',
    options: {
      enableCrawling: 'Set to true to crawl all internal pages (default: false)',
      crawlOptions: {
        maxPages: 'Maximum pages to crawl (default: 30)',
        maxDepth: 'Maximum crawl depth (default: 3)',
        requestTimeout: 'Timeout per request in ms (default: 10000)',
        concurrency: 'Parallel page fetches (default: 3)',
        includeSubdomains: 'Include subdomains (default: false)',
        totalCrawlTimeout: 'Total crawl timeout in ms (default: 30000)',
      },
    },
    cache: {
      size: cache.size,
      maxSize: cache.max,
      ttlMs: CACHE_TTL_MS,
    },
  });
}
