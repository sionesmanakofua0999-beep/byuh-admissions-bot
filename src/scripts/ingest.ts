import { config } from 'dotenv';
config({ path: '.env' });

import { db } from '../db';
import { byuhChunks } from '../db/schema';
import { scrapeWebsite } from '../lib/scraper';
import { chunkText } from '../lib/chunker';
import { eq } from 'drizzle-orm';
import pLimit from 'p-limit';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });

  return response.data[0].embedding;
}

async function ingest() {
  console.log('Starting ingestion pipeline...');
  console.log('OpenAI API Key set:', !!process.env.OPENAI_API_KEY);

  // Step 1 — Scrape
  const pages = await scrapeWebsite();
  console.log(`Scraped ${pages.length} pages. Starting chunking + embedding...`);

  const limit = pLimit(5); // 5 concurrent embedding requests

  for (const page of pages) {
    console.log(`\nProcessing: ${page.url}`);

    // Step 2 — Chunk
    const chunks = chunkText(page.content);
    console.log(`  ${chunks.length} chunks`);

    // Step 3 — Delete existing chunks for this URL (idempotent)
    await db.delete(byuhChunks).where(eq(byuhChunks.url, page.url));

    // Step 4 — Generate embeddings concurrently
    const embeddingTasks = chunks.map((chunk, index) =>
      limit(async () => {
        const embedding = await generateEmbedding(chunk);
        return { chunk, index, embedding };
      })
    );

    const results = await Promise.all(embeddingTasks);

    // Step 5 — Insert into database
    for (const { chunk, index, embedding } of results) {
      await db.insert(byuhChunks).values({
        url: page.url,
        title: page.title,
        content: chunk,
        chunkIndex: index,
        embedding,
      });
    }

    console.log(`  Inserted ${chunks.length} chunks for ${page.url}`);
  }

  console.log('\nIngestion complete!');
}

ingest().catch((err) => {
  console.error('Ingestion failed:', err);
  process.exit(1);
});