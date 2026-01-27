#!/usr/bin/env npx tsx

/**
 * Browser-based EUR-Lex fetcher to bypass AWS WAF challenges.
 *
 * EUR-Lex deployed AWS WAF that returns 2036-byte JavaScript challenge pages
 * instead of actual HTML when using fetch(). This script launches a headless
 * browser to wait for the challenge to complete and retrieve the real content.
 *
 * Usage:
 *   npx tsx scripts/ingest-eurlex-browser.ts <celex_id>
 *   npx tsx scripts/ingest-eurlex-browser.ts 32016R0679
 *
 * Or import as a function:
 *   import { fetchEurLexWithBrowser } from './scripts/ingest-eurlex-browser';
 *   const html = await fetchEurLexWithBrowser('32016R0679');
 */

import puppeteer from 'puppeteer';

/**
 * Fetches EUR-Lex regulation HTML using Puppeteer to bypass WAF challenges.
 *
 * @param celexId - CELEX identifier (e.g., '32016R0679' for GDPR)
 * @returns Full HTML content of the regulation
 * @throws Error if fetching fails or content is invalid
 */
export async function fetchEurLexWithBrowser(celexId: string): Promise<string> {
  const url = `https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:${celexId}`;
  console.log(`[Browser] Launching headless browser...`);
  console.log(`[Browser] Fetching: ${url}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
    ],
  });

  try {
    const page = await browser.newPage();

    // Set realistic User-Agent to appear as a normal browser
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });

    console.log(`[Browser] Navigating to URL...`);
    await page.goto(url, {
      waitUntil: 'networkidle0', // Wait until network is idle
      timeout: 30000,
    });

    console.log(`[Browser] Page loaded. Waiting for WAF challenge to complete...`);

    // Wait a bit longer to ensure WAF challenge JavaScript has executed
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Get the full HTML content
    const html = await page.content();

    console.log(`[Browser] Fetched ${html.length} bytes`);

    // Validate that we got real content, not a WAF challenge page
    if (html.length < 10000) {
      throw new Error(`Fetched content is suspiciously small (${html.length} bytes). Possible WAF block.`);
    }

    if (html.includes('window.gokuProps')) {
      throw new Error('Received AWS WAF challenge page instead of regulation content.');
    }

    if (!html.includes('Article')) {
      console.warn('[Browser] Warning: HTML does not contain "Article" - may not be valid regulation content');
    }

    return html;
  } finally {
    await browser.close();
    console.log(`[Browser] Browser closed`);
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const [,, celexId] = process.argv;

  if (!celexId) {
    console.log('Usage: npx tsx scripts/ingest-eurlex-browser.ts <celex_id>');
    console.log('Example: npx tsx scripts/ingest-eurlex-browser.ts 32016R0679');
    console.log('\nThis will fetch the HTML and print it to stdout.');
    console.log('Pipe to a file: npx tsx scripts/ingest-eurlex-browser.ts 32016R0679 > output.html');
    process.exit(1);
  }

  fetchEurLexWithBrowser(celexId)
    .then(html => {
      // Output HTML to stdout for piping
      console.log('\n--- HTML Content ---\n');
      console.log(html);
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}
