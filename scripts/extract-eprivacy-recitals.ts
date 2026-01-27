#!/usr/bin/env npx tsx

import { writeFileSync, readFileSync } from 'fs';
import { JSDOM } from 'jsdom';

async function fetchEPrivacyRecitals() {
  const url = 'https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32002L0058';
  console.log(`Fetching: ${url}`);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible)',
      'Accept': 'text/html',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed: ${response.status}`);
  }

  const html = await response.text();
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  // Extract all paragraphs
  const paragraphs = Array.from(doc.querySelectorAll('p'));

  const recitals: Array<{ recital_number: number; text: string }> = [];
  let inRecitals = false;
  let currentNumber: number | null = null;
  let currentText: string[] = [];

  for (const p of paragraphs) {
    const text = p.textContent?.trim() || '';

    // Check if we've entered the recitals section
    if (text === 'Whereas:') {
      inRecitals = true;
      continue;
    }

    // Check if we've left the recitals section
    if (text.match(/^HAVE ADOPTED/i) || text.match(/^Article\s+1/i)) {
      if (currentNumber && currentText.length > 0) {
        recitals.push({
          recital_number: currentNumber,
          text: currentText.join('\n\n'),
        });
      }
      break;
    }

    if (!inRecitals) continue;

    // Check for recital number at start: "(1)", "(2)", etc.
    const recitalMatch = text.match(/^\((\d+)\)/);

    if (recitalMatch) {
      // Save previous recital
      if (currentNumber && currentText.length > 0) {
        recitals.push({
          recital_number: currentNumber,
          text: currentText.join('\n\n'),
        });
      }

      // Start new recital
      currentNumber = parseInt(recitalMatch[1]);
      const remainingText = text.substring(recitalMatch[0].length).trim();
      currentText = remainingText ? [remainingText] : [];
    } else if (currentNumber && text.length > 0) {
      // Add to current recital
      currentText.push(text);
    }
  }

  // Don't forget the last one
  if (currentNumber && currentText.length > 0) {
    recitals.push({
      recital_number: currentNumber,
      text: currentText.join('\n\n'),
    });
  }

  console.log(`Extracted ${recitals.length} recitals`);

  // Load existing ePrivacy JSON
  const existingData = JSON.parse(readFileSync('data/seed/eprivacy.json', 'utf-8'));
  existingData.recitals = recitals;

  // Save updated file
  writeFileSync('data/seed/eprivacy.json', JSON.stringify(existingData, null, 2));
  console.log(`Saved to: data/seed/eprivacy.json`);
  console.log(`Articles: ${existingData.articles.length}`);
  console.log(`Recitals: ${recitals.length}`);
}

fetchEPrivacyRecitals().catch(console.error);
