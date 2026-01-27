// tests/scripts/eurlex-browser.test.ts
import { describe, it, expect } from 'vitest';
import { fetchEurLexWithBrowser } from '../../scripts/ingest-eurlex-browser';

describe('fetchEurLexWithBrowser', () => {
  it('should fetch GDPR HTML and bypass WAF', async () => {
    const html = await fetchEurLexWithBrowser('32016R0679');

    expect(html.length).toBeGreaterThan(100000); // Real HTML, not 2036 byte WAF challenge
    expect(html).toContain('Article'); // Contains regulation content
    expect(html).not.toContain('window.gokuProps'); // Not WAF challenge
  }, 60000); // 60s timeout for browser launch
});
