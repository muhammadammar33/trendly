/**
 * Static HTML parsing with Cheerio
 */

import * as cheerio from 'cheerio';
import { normalizeUrl } from './validation';
import { extractColors } from './colors';
import {
  scoreImage,
  filterImage,
  parseSrcSet,
  deduplicateImages,
  sortImagesByScore,
  aggregateImagesFromPages,
  ImageCandidate,
} from './images';
import type { ScrapeResult, BusinessInfo, BrandInfo, SocialLinks, CrawlStats } from './types';

export interface ParseOptions {
  html: string;
  finalUrl: string;
  inputUrl: string;
}

/**
 * Parse static HTML and extract all business data
 */
export async function parseStaticHtml(options: ParseOptions): Promise<Partial<ScrapeResult>> {
  const { html, finalUrl, inputUrl } = options;
  const $ = cheerio.load(html);

  const startTime = Date.now();

  // Extract all components in parallel
  const [business, brand, images] = await Promise.all([
    extractBusinessInfo($, finalUrl),
    extractBrandInfo($, html, finalUrl),
    extractImages($, finalUrl),
  ]);

  const timingsMs = {
    parsing: Date.now() - startTime,
  };

  const dedupedImages = deduplicateImages(images);
  const sortedImages = sortImagesByScore(dedupedImages);

  return {
    status: 'ok',
    inputUrl,
    finalUrl,
    fetchedAt: new Date().toISOString(),
    business,
    brand,
    images: sortedImages,
    debug: {
      methodUsed: 'static',
      timingsMs,
      notes: [
        `Parsed ${images.length} raw images`,
        `After deduplication: ${dedupedImages.length} unique images`,
        `Image types found: ${Array.from(new Set(images.map(i => i.typeGuess))).join(', ')}`,
        `Top 5 scores: ${sortedImages.slice(0, 5).map(i => `${i.typeGuess}(${i.score})`).join(', ')}`,
        `Found ${business.emails.length} emails`,
      ],
    },
  };
}

/**
 * Parse multiple pages from a crawl and aggregate data
 */
export async function parseMultiplePages(
  pages: Array<{ url: string; html: string }>,
  inputUrl: string,
  internalCrawlStats: { pagesVisited: number; pagesSkipped: number; pagesFailed: number; crawlTimeMs: number }
): Promise<Partial<ScrapeResult>> {
  const startTime = Date.now();

  if (pages.length === 0) {
    throw new Error('No pages to parse');
  }

  // Parse the first page (homepage) for business and brand info
  const firstPage = pages[0];
  const $first = cheerio.load(firstPage.html);

  const [business, brand] = await Promise.all([
    extractBusinessInfo($first, firstPage.url),
    extractBrandInfo($first, firstPage.html, firstPage.url),
  ]);

  // Extract images from all pages
  const allPagesImages: ImageCandidate[][] = [];
  const pageUrls: string[] = [];

  for (const page of pages) {
    const $ = cheerio.load(page.html);
    const images = await extractImages($, page.url);
    allPagesImages.push(images);
    pageUrls.push(page.url);
  }

  // Aggregate and deduplicate images across all pages
  const aggregatedImages = aggregateImagesFromPages(allPagesImages, pageUrls, firstPage.url);
  const dedupedImages = deduplicateImages(aggregatedImages);
  const sortedImages = sortImagesByScore(dedupedImages);

  const totalRawImages = allPagesImages.reduce((sum, imgs) => sum + imgs.length, 0);

  const timingsMs = {
    parsing: Date.now() - startTime,
  };

  // Build crawl stats with image counts
  const finalCrawlStats: CrawlStats = {
    pagesVisited: internalCrawlStats.pagesVisited,
    pagesSkipped: internalCrawlStats.pagesSkipped,
    pagesFailed: internalCrawlStats.pagesFailed,
    imagesFound: totalRawImages,
    crawlTimeMs: internalCrawlStats.crawlTimeMs,
  };

  return {
    status: 'ok',
    inputUrl,
    finalUrl: firstPage.url,
    fetchedAt: new Date().toISOString(),
    business,
    brand,
    images: sortedImages,
    crawlStats: finalCrawlStats,
    debug: {
      methodUsed: 'static',
      timingsMs,
      notes: [
        `Crawled ${pages.length} pages`,
        `Found ${totalRawImages} raw images across all pages`,
        `After aggregation: ${aggregatedImages.length} images`,
        `After deduplication: ${dedupedImages.length} unique images`,
        `Image types found: ${Array.from(new Set(sortedImages.map(i => i.typeGuess))).join(', ')}`,
        `Top 5 scores: ${sortedImages.slice(0, 5).map(i => `${i.typeGuess}(${i.score})`).join(', ')}`,
        `Found ${business.emails.length} emails`,
      ],
    },
  };
}

/**
 * Extract business information
 */
async function extractBusinessInfo($: cheerio.CheerioAPI, baseUrl: string): Promise<BusinessInfo> {
  // Title
  const title =
    $('meta[property="og:title"]').attr('content') ||
    $('meta[name="twitter:title"]').attr('content') ||
    $('title').text() ||
    $('h1').first().text() ||
    '';

  // Description
  const description =
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="description"]').attr('content') ||
    $('meta[name="twitter:description"]').attr('content') ||
    '';

  // Headings
  const headings: string[] = [];
  $('h1, h2').each((_, elem) => {
    const text = $(elem).text().trim();
    if (text && text.length < 200 && headings.length < 10) {
      headings.push(text);
    }
  });

  // CTA texts
  const ctaTexts = extractCTATexts($);

  // Contact info
  const bodyText = $('body').text();
  const emails = extractEmails(bodyText);
  const phones = extractPhones(bodyText);
  const addresses = extractAddresses($);

  // Social links
  const socialLinks = extractSocialLinks($);

  return {
    title: title.trim(),
    description: description.trim(),
    headings: [...new Set(headings)],
    ctaTexts: [...new Set(ctaTexts)],
    emails: [...new Set(emails)],
    phones: [...new Set(phones)],
    addresses: [...new Set(addresses)],
    socialLinks,
  };
}

/**
 * Extract CTA button/link texts
 */
function extractCTATexts($: cheerio.CheerioAPI): string[] {
  const ctaTexts: string[] = [];
  const ctaKeywords = /\b(start|begin|get|try|buy|purchase|shop|book|schedule|contact|demo|free|sign up|register|join|subscribe|download|learn more)\b/i;

  // Buttons
  $('button, a.button, a.btn, [role="button"]').each((_, elem) => {
    const text = $(elem).text().trim();
    if (text && text.length < 50 && ctaKeywords.test(text)) {
      ctaTexts.push(text);
    }
  });

  // Links with CTA-like text
  $('a').each((_, elem) => {
    const text = $(elem).text().trim();
    if (text && text.length < 50 && text.length > 3 && ctaKeywords.test(text)) {
      ctaTexts.push(text);
    }
  });

  return ctaTexts.slice(0, 15);
}

/**
 * Extract email addresses
 */
function extractEmails(text: string): string[] {
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const matches = text.match(emailRegex) || [];
  
  return matches
    .filter((email) => {
      // Filter out common false positives
      return (
        !email.includes('example.com') &&
        !email.includes('domain.com') &&
        !email.includes('your-email') &&
        !email.includes('sentry') &&
        !email.includes('wixpress')
      );
    })
    .slice(0, 5);
}

/**
 * Extract phone numbers
 */
function extractPhones(text: string): string[] {
  const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
  const matches = text.match(phoneRegex) || [];
  
  return [...new Set(matches)]
    .filter((phone) => {
      // Basic validation - at least 10 digits
      const digits = phone.replace(/\D/g, '');
      return digits.length >= 10 && digits.length <= 15;
    })
    .slice(0, 5);
}

/**
 * Extract addresses from structured data
 */
function extractAddresses($: cheerio.CheerioAPI): string[] {
  const addresses: string[] = [];

  // Look for schema.org structured data
  $('script[type="application/ld+json"]').each((_, elem) => {
    try {
      const json = JSON.parse($(elem).html() || '{}');
      const address = extractAddressFromSchema(json);
      if (address) addresses.push(address);
    } catch (e) {
      // Invalid JSON, skip
    }
  });

  // Look for address elements
  $('[itemprop="address"], .address, #address').each((_, elem) => {
    const text = $(elem).text().trim();
    if (text && text.length > 10 && text.length < 200) {
      addresses.push(text);
    }
  });

  return [...new Set(addresses)].slice(0, 3);
}

/**
 * Extract address from schema.org JSON-LD
 */
function extractAddressFromSchema(json: any): string | null {
  if (!json) return null;

  // Handle arrays
  if (Array.isArray(json)) {
    for (const item of json) {
      const addr = extractAddressFromSchema(item);
      if (addr) return addr;
    }
    return null;
  }

  // Look for address property
  if (json.address) {
    if (typeof json.address === 'string') {
      return json.address;
    }
    if (json.address.streetAddress || json.address.addressLocality) {
      const parts = [
        json.address.streetAddress,
        json.address.addressLocality,
        json.address.addressRegion,
        json.address.postalCode,
        json.address.addressCountry,
      ].filter(Boolean);
      return parts.join(', ');
    }
  }

  // Recurse into nested objects
  if (json['@graph']) {
    return extractAddressFromSchema(json['@graph']);
  }

  return null;
}

/**
 * Extract social media links
 */
function extractSocialLinks($: cheerio.CheerioAPI): SocialLinks {
  const socialLinks: SocialLinks = {
    linkedin: [],
    instagram: [],
    facebook: [],
    x: [],
    youtube: [],
    tiktok: [],
  };

  $('a[href]').each((_, elem) => {
    const href = $(elem).attr('href') || '';
    const lower = href.toLowerCase();

    if (lower.includes('linkedin.com/')) {
      socialLinks.linkedin.push(href);
    } else if (lower.includes('instagram.com/')) {
      socialLinks.instagram.push(href);
    } else if (lower.includes('facebook.com/')) {
      socialLinks.facebook.push(href);
    } else if (lower.includes('twitter.com/') || lower.includes('x.com/')) {
      socialLinks.x.push(href);
    } else if (lower.includes('youtube.com/') || lower.includes('youtu.be/')) {
      socialLinks.youtube.push(href);
    } else if (lower.includes('tiktok.com/')) {
      socialLinks.tiktok.push(href);
    }
  });

  // Deduplicate and limit
  for (const key in socialLinks) {
    socialLinks[key as keyof SocialLinks] = [
      ...new Set(socialLinks[key as keyof SocialLinks]),
    ].slice(0, 3);
  }

  return socialLinks;
}

/**
 * Extract brand information
 */
async function extractBrandInfo(
  $: cheerio.CheerioAPI,
  html: string,
  baseUrl: string
): Promise<BrandInfo> {
  // Extract brand name from multiple sources
  let brandName = '';
  
  // 1. Try og:site_name meta tag (most reliable)
  brandName = $('meta[property="og:site_name"]').attr('content') || '';
  
  // 2. Try application-name meta tag
  if (!brandName) {
    brandName = $('meta[name="application-name"]').attr('content') || '';
  }
  
  // 3. Try schema.org name
  if (!brandName) {
    $('script[type="application/ld+json"]').each((_, elem) => {
      try {
        const json = JSON.parse($(elem).html() || '{}');
        const name = findNameInSchema(json);
        if (name) brandName = name;
      } catch (e) {
        // Invalid JSON
      }
    });
  }
  
  // 4. Extract from page title (last resort)
  if (!brandName) {
    const title = $('title').text().trim();
    if (title) {
      // Try to extract brand name from title by splitting on common separators
      const parts = title.split(/[-–—|]/)[0].trim();
      brandName = parts;
    }
  }
  
  // Favicon
  const favicon =
    normalizeUrl($('link[rel="icon"]').attr('href') || '', baseUrl) ||
    normalizeUrl($('link[rel="shortcut icon"]').attr('href') || '', baseUrl) ||
    normalizeUrl('/favicon.ico', baseUrl);

  // Logo candidates
  const logoCandidates: string[] = [];

  // 1. Images with "logo" in alt or src
  $('img').each((_, elem) => {
    const src = $(elem).attr('src') || '';
    const alt = $(elem).attr('alt') || '';
    const className = $(elem).attr('class') || '';
    const id = $(elem).attr('id') || '';
    
    if (src && (
      src.toLowerCase().includes('logo') || 
      alt.toLowerCase().includes('logo') ||
      className.toLowerCase().includes('logo') ||
      id.toLowerCase().includes('logo')
    )) {
      const normalized = normalizeUrl(src, baseUrl);
      if (normalized) logoCandidates.push(normalized);
    }
  });

  // 2. SVG logos
  $('svg').each((_, elem) => {
    const className = $(elem).attr('class') || '';
    const id = $(elem).attr('id') || '';
    
    if (className.toLowerCase().includes('logo') || id.toLowerCase().includes('logo')) {
      // Try to find nested image
      const image = $(elem).find('image').attr('href') || $(elem).find('image').attr('xlink:href');
      if (image) {
        logoCandidates.push(normalizeUrl(image, baseUrl));
      }
    }
  });

  // 3. Header/navbar logos (common patterns)
  $('header img, nav img, .header img, .navbar img, .logo img, #logo img').each((_, elem) => {
    const src = $(elem).attr('src');
    if (src) {
      logoCandidates.push(normalizeUrl(src, baseUrl));
    }
  });

  // 4. Apple touch icon
  const appleTouchIcon = $('link[rel="apple-touch-icon"]').attr('href');
  if (appleTouchIcon) {
    logoCandidates.push(normalizeUrl(appleTouchIcon, baseUrl));
  }

  // 5. Schema.org logo
  $('script[type="application/ld+json"]').each((_, elem) => {
    try {
      const json = JSON.parse($(elem).html() || '{}');
      const logo = findLogoInSchema(json);
      if (logo) logoCandidates.push(normalizeUrl(logo, baseUrl));
    } catch (e) {
      // Invalid JSON
    }
  });

  // 6. OG image as last resort fallback
  const ogImage = $('meta[property="og:image"]').attr('content');
  if (ogImage && logoCandidates.length === 0) {
    logoCandidates.push(normalizeUrl(ogImage, baseUrl));
  }

  // Brand colors
  const brandColors = extractColors(html, $);

  return {
    name: brandName,
    favicon,
    logoCandidates: [...new Set(logoCandidates.filter(Boolean))].slice(0, 10),
    brandColors,
  };
}

/**
 * Find name in schema.org JSON-LD
 */
function findNameInSchema(json: any): string | null {
  if (!json) return null;

  if (Array.isArray(json)) {
    for (const item of json) {
      const name = findNameInSchema(item);
      if (name) return name;
    }
    return null;
  }

  // Look for name property
  if (json.name && typeof json.name === 'string') {
    return json.name;
  }

  // Recurse into @graph
  if (json['@graph']) {
    return findNameInSchema(json['@graph']);
  }

  return null;
}

/**
 * Find logo in schema.org JSON-LD
 */
function findLogoInSchema(json: any): string | null {
  if (!json) return null;

  if (Array.isArray(json)) {
    for (const item of json) {
      const logo = findLogoInSchema(item);
      if (logo) return logo;
    }
    return null;
  }

  if (json.logo) {
    if (typeof json.logo === 'string') return json.logo;
    if (json.logo.url) return json.logo.url;
  }

  if (json['@graph']) {
    return findLogoInSchema(json['@graph']);
  }

  return null;
}

/**
 * Extract all images
 */
async function extractImages($: cheerio.CheerioAPI, baseUrl: string): Promise<ImageCandidate[]> {
  const images: ImageCandidate[] = [];

  // 1. Standard img tags (including lazy-loaded)
  $('img').each((_, elem) => {
    const alt = $(elem).attr('alt') || '';
    const className = $(elem).attr('class') || '';
    
    // Check all possible image source attributes
    const sources = [
      $(elem).attr('src'),
      $(elem).attr('data-src'),
      $(elem).attr('data-lazy-src'),
      $(elem).attr('data-original'),
      $(elem).attr('data-lazy'),
      $(elem).attr('data-srcset')?.split(',')[0]?.trim().split(' ')[0],
    ].filter(Boolean);

    sources.forEach((src) => {
      if (src && src.trim().length > 0) {
        const normalized = normalizeUrl(src.trim(), baseUrl);
        if (normalized && normalized.length > 0 && filterImage(normalized)) {
          images.push(scoreImage(normalized, 'img', alt, className, baseUrl));
        }
      }
    });

    // Check srcset for higher resolution variants
    const srcset = $(elem).attr('srcset') || $(elem).attr('data-srcset');
    if (srcset) {
      const srcsetUrls = parseSrcSet(srcset, baseUrl);
      srcsetUrls.forEach((url) => {
        if (url && url.length > 0) {
          images.push(scoreImage(url, 'srcset', alt, className, baseUrl));
        }
      });
    }
  });

  // 2. Picture elements (modern responsive images)
  $('picture source').each((_, elem) => {
    const srcset = $(elem).attr('srcset');
    if (srcset) {
      const srcsetUrls = parseSrcSet(srcset, baseUrl);
      srcsetUrls.forEach((url) => {
        images.push(scoreImage(url, 'srcset', '', 'picture', baseUrl));
      });
    }
  });

  // 3. All Open Graph images (og:image, og:image:secure_url, etc.)
  $('meta[property^="og:image"]').each((_, elem) => {
    const content = $(elem).attr('content');
    if (content) {
      const normalized = normalizeUrl(content, baseUrl);
      if (normalized && filterImage(normalized)) {
        images.push(scoreImage(normalized, 'og', '', '', baseUrl));
      }
    }
  });

  // 4. Twitter Card images (all variants)
  $('meta[name^="twitter:image"]').each((_, elem) => {
    const content = $(elem).attr('content');
    if (content) {
      const normalized = normalizeUrl(content, baseUrl);
      if (normalized && filterImage(normalized)) {
        images.push(scoreImage(normalized, 'twitter', '', '', baseUrl));
      }
    }
  });

  // 5. Schema.org images
  $('meta[itemprop="image"]').each((_, elem) => {
    const content = $(elem).attr('content');
    if (content) {
      const normalized = normalizeUrl(content, baseUrl);
      if (normalized && filterImage(normalized)) {
        images.push(scoreImage(normalized, 'og', '', '', baseUrl));
      }
    }
  });

  // 6. Icons (but with lower priority)
  $('link[rel="icon"], link[rel="apple-touch-icon"], link[rel="shortcut icon"]').each((_, elem) => {
    const href = $(elem).attr('href') || '';
    const normalized = normalizeUrl(href, baseUrl);
    if (normalized && filterImage(normalized)) {
      images.push(scoreImage(normalized, 'icon', '', '', baseUrl));
    }
  });

  // 7. Background images in inline styles (enhanced)
  $('[style*="background"]').each((_, elem) => {
    const style = $(elem).attr('style') || '';
    // Match multiple url() patterns
    const urlMatches = style.matchAll(/url\(['"]?([^'"()]+)['"]?\)/g);
    for (const match of urlMatches) {
      const normalized = normalizeUrl(match[1], baseUrl);
      if (normalized && filterImage(normalized)) {
        const className = $(elem).attr('class') || '';
        images.push(scoreImage(normalized, 'css', '', className, baseUrl));
      }
    }
  });

  // 8. Divs with data-bg or data-background attributes (common in modern sites)
  $('[data-bg], [data-background], [data-background-image]').each((_, elem) => {
    const bg = $(elem).attr('data-bg') || $(elem).attr('data-background') || $(elem).attr('data-background-image');
    if (bg) {
      const normalized = normalizeUrl(bg, baseUrl);
      if (normalized && filterImage(normalized)) {
        const className = $(elem).attr('class') || '';
        images.push(scoreImage(normalized, 'css', '', className, baseUrl));
      }
    }
  });

  // 9. WordPress featured images and thumbnails
  $('img.wp-post-image, img.attachment-thumbnail, img[class*="featured"]').each((_, elem) => {
    const src = $(elem).attr('src') || $(elem).attr('data-src');
    if (src) {
      const normalized = normalizeUrl(src, baseUrl);
      const alt = $(elem).attr('alt') || '';
      if (normalized && filterImage(normalized)) {
        images.push(scoreImage(normalized, 'img', alt, 'featured', baseUrl));
      }
    }
  });

  console.log(`[ExtractImages] Found ${images.length} total images from various sources`);
  return images;
}
