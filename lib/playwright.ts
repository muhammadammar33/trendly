/**
 * Playwright-based scraper for JavaScript-rendered pages
 */

import { chromium, Browser, Page } from 'playwright';
import { parseStaticHtml } from './parser';
import type { ScrapeResult } from './types';

let browserInstance: Browser | null = null;
let activeSessions = 0;
const MAX_CONCURRENT = parseInt(process.env.MAX_PLAYWRIGHT_CONCURRENT || '2', 10);

/**
 * Check if Playwright is available in the current environment
 */
function isPlaywrightAvailable(): boolean {
  // Disable Playwright on Vercel and other serverless environments
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return false;
  }
  return true;
}

/**
 * Get or create a shared browser instance
 */
async function getBrowser(): Promise<Browser> {
  if (!isPlaywrightAvailable()) {
    throw new Error('Playwright is not available in this environment');
  }
  
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
      ],
    });
  }
  return browserInstance;
}

/**
 * Scrape a JavaScript-rendered page with Playwright
 */
export async function scrapeWithPlaywright(
  url: string,
  inputUrl: string
): Promise<Partial<ScrapeResult>> {
  // Check if Playwright is available
  if (!isPlaywrightAvailable()) {
    return {
      status: 'error',
      error: 'Playwright is not available in serverless environment',
      debug: {
        methodUsed: 'failed',
        timingsMs: { total: 0 },
        notes: ['Playwright disabled in serverless environment'],
      },
    };
  }

  const startTime = Date.now();
  const timeout = parseInt(process.env.REQUEST_TIMEOUT_MS || '30000', 10);

  // Check concurrency limit
  if (activeSessions >= MAX_CONCURRENT) {
    return {
      status: 'error',
      error: 'Too many concurrent Playwright sessions. Try again later.',
      debug: {
        methodUsed: 'failed',
        timingsMs: { total: 0 },
        notes: ['Concurrency limit reached'],
      },
    };
  }

  activeSessions++;
  let page: Page | null = null;

  try {
    const browser = await getBrowser();
    page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    // Set timeout
    page.setDefaultTimeout(timeout);

    // Block unnecessary resources to speed up loading
    await page.route('**/*', (route) => {
      const resourceType = route.request().resourceType();
      if (['font', 'media'].includes(resourceType)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    // Navigate to page with domcontentloaded (faster than networkidle)
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded', // Changed from 'networkidle' to prevent timeout
      timeout,
    });

    if (!response) {
      throw new Error('No response from page');
    }

    const finalUrl = page.url();

    // Wait for images to load with a reasonable timeout
    try {
      await page.waitForLoadState('load', { timeout: 10000 });
    } catch (e) {
      console.log('[Playwright] Page load timeout, continuing with available content...');
    }

    // Wait for dynamic content to render
    await page.waitForTimeout(3000);

    // Get the rendered HTML
    const html = await page.content();

    // Close page
    await page.close();
    page = null;

    const fetchTime = Date.now() - startTime;

    // Parse the HTML
    const parseStart = Date.now();
    const result = await parseStaticHtml({
      html,
      finalUrl,
      inputUrl,
    });

    const parseTime = Date.now() - parseStart;

    // Update debug info
    if (result.debug) {
      result.debug.methodUsed = 'playwright';
      result.debug.timingsMs = {
        fetch: fetchTime,
        parse: parseTime,
        total: Date.now() - startTime,
      };
      result.debug.notes.push('Used Playwright for JavaScript rendering');
    }

    return result;
  } catch (error: any) {
    console.error('Playwright scraping error:', error);

    return {
      status: 'error',
      error: error.message || 'Failed to scrape with Playwright',
      debug: {
        methodUsed: 'failed',
        timingsMs: { total: Date.now() - startTime },
        notes: [`Playwright error: ${error.message}`],
      },
    };
  } finally {
    activeSessions--;
    if (page) {
      try {
        await page.close();
      } catch (e) {
        // Ignore close errors
      }
    }
  }
}

/**
 * Clean up browser instance on shutdown
 */
export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

/**
 * Check if Playwright should be used based on initial content
 */
export function shouldUsePlaywright(html: string): boolean {
  // If HTML is very small, likely needs JS rendering
  if (html.length < 1000) {
    return true;
  }

  // Check for common SPA indicators
  const indicators = [
    /<div[^>]+id=["']root["']/i,
    /<div[^>]+id=["']app["']/i,
    /<noscript>.*?enable javascript.*?<\/noscript>/i,
    /react/i,
    /vue/i,
    /angular/i,
  ];

  for (const pattern of indicators) {
    if (pattern.test(html)) {
      return true;
    }
  }

  // Check if there's very little actual content
  const textContent = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim();

  if (textContent.length < 500) {
    return true;
  }

  return false;
}
