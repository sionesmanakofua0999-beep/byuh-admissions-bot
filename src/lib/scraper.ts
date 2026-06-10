import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://admissions.byuh.edu';
const MAX_PAGES = 100;
const DELAY_MS = 500;

export interface ScrapedPage {
  url: string;
  title: string;
  content: string;
}

function normalizeUrl(url: string, base: string): string | null {
  try {
    const resolved = new URL(url, base);
    // Stay within admissions.byuh.edu
    if (resolved.hostname !== 'admissions.byuh.edu') return null;
    // Skip non-HTML resources
    const ext = resolved.pathname.split('.').pop()?.toLowerCase();
    if (['pdf', 'jpg', 'jpeg', 'png', 'gif', 'css', 'js', 'svg', 'ico'].includes(ext || '')) return null;
    // Normalize: remove trailing slash, fragment, query params
    resolved.hash = '';
    resolved.search = '';
    let normalized = resolved.toString();
    if (normalized.endsWith('/') && normalized !== BASE_URL + '/') {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return null;
  }
}

function extractContent($: cheerio.CheerioAPI): string {
  // Remove non-content elements
  $('script, style, nav, footer, header, iframe, noscript').remove();

  // Prefer semantic containers
  const main =
    $('main').first() ||
    $('article').first() ||
    $('[role=main]').first();

  const target = main.length ? main : $('body');
  return target.text().replace(/\s+/g, ' ').trim();
}

function extractLinks($: cheerio.CheerioAPI, currentUrl: string): string[] {
  const links: string[] = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const normalized = normalizeUrl(href, currentUrl);
    if (normalized) links.push(normalized);
  });
  return links;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function scrapeWebsite(): Promise<ScrapedPage[]> {
  const visited = new Set<string>();
  const queue: string[] = [BASE_URL];
  const pages: ScrapedPage[] = [];

  console.log('Starting BFS crawl from', BASE_URL);

  while (queue.length > 0 && pages.length < MAX_PAGES) {
    const url = queue.shift()!;

    if (visited.has(url)) continue;
    visited.add(url);

    try {
      console.log(`[${pages.length + 1}/${MAX_PAGES}] Scraping: ${url}`);

      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; BYUHBot/1.0)',
        },
      });

      const contentType = String(response.headers['content-type'] || '');
if (!contentType.includes('text/html')) continue;

      const $ = cheerio.load(response.data);
      const title = $('title').text().trim() || url;
      const content = extractContent($);

      if (content.length > 100) {
        pages.push({ url, title, content });
      }

      // Add new links to queue
      const links = extractLinks($, url);
      for (const link of links) {
        if (!visited.has(link) && !queue.includes(link)) {
          queue.push(link);
        }
      }

      await delay(DELAY_MS);
    } catch (err) {
      console.error(`Failed to scrape ${url}:`, err);
    }
  }

  console.log(`Crawl complete. Scraped ${pages.length} pages.`);
  return pages;
}