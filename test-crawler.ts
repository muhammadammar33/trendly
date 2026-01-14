/**
 * Test script for multi-page web crawler
 * Run with: npx tsx test-crawler.ts
 */

import { scrapeWebsite } from './lib/scraper';

async function testSinglePage() {
  console.log('\n=== TEST 1: Single Page (Default) ===');
  const result = await scrapeWebsite('https://example.com');
  
  console.log('Status:', result.status);
  console.log('Images found:', result.images.length);
  console.log('Crawl stats:', result.crawlStats || 'N/A (single page mode)');
  console.log('Top 5 images:');
  result.images.slice(0, 5).forEach((img, i) => {
    console.log(`  ${i + 1}. ${img.typeGuess} (${img.score}) - ${img.url.substring(0, 60)}...`);
  });
}

async function testMultiPage() {
  console.log('\n=== TEST 2: Multi-Page Crawl ===');
  const result = await scrapeWebsite('https://example.com', {
    enableCrawling: true,
    crawlOptions: {
      maxPages: 5,
      maxDepth: 2,
    },
  });
  
  console.log('Status:', result.status);
  console.log('Images found:', result.images.length);
  console.log('Crawl stats:', result.crawlStats);
  console.log('Top 5 images:');
  result.images.slice(0, 5).forEach((img, i) => {
    console.log(`  ${i + 1}. ${img.typeGuess} (${img.score}) - ${img.url.substring(0, 60)}...`);
  });
  
  if (result.debug?.notes) {
    console.log('\nDebug notes:');
    result.debug.notes.forEach(note => console.log(`  - ${note}`));
  }
}

async function main() {
  try {
    await testSinglePage();
    await testMultiPage();
    console.log('\n✅ All tests completed successfully!');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

main();
