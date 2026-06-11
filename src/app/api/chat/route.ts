import { NextResponse } from "next/server";
import OpenAI from "openai";
import { db } from "@/db";
import { byuhChunks } from "@/db/schema";
import { sql } from "drizzle-orm";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function getRelevantChunks(query: string, topK = 5) {
  const embeddingRes = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  });
  const queryEmbedding = embeddingRes.data[0].embedding;
  const vectorString = "[" + queryEmbedding.join(",") + "]";

  const chunks = await db.execute(sql`
    SELECT content, url, title,
      1 - (embedding <=> ${vectorString}::vector) AS similarity
    FROM byuh_chunks
    ORDER BY embedding <=> ${vectorString}::vector
    LIMIT ${topK}
  `);

  return chunks.rows as { content: string; url: string; title: string; similarity: number }[];
}

export async function POST(request: Request) {
  try {
    const { q, history = [] } = await request.json();
    console.log("/api/chat received:", { q });

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ ok: false, error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const chunks = await getRelevantChunks(q);
    const context = chunks
      .map((c) => `URL: ${c.url}\nTitle: ${c.title}\n${c.content}`)
      .join("\n\n---\n\n");

    const systemPrompt = `You are a professional assistant answering questions about BYU–Hawaii admissions.
Use the provided source excerpts to answer accurately, clearly, and formally.
If the question is not directly covered by the content, reply that you can only help with BYU–Hawaii admissions questions and suggest the user consult the Admissions website or the appropriate department.
When explaining admissions processes, respond in an organized manner using numbered steps, bullets, or clearly labeled sections.
Use complete sentences, avoid colloquial language, and maintain a polite, respectful tone.
You may use markdown formatting including bold (**text**), bullet points, and links to enhance readability.
Do not use markdown heading markers such as # at the start of lines.

SOURCE EXCERPTS:
${context}`;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...(history as { role: string; text: string }[]).map((m) => ({
        role: m.role === "user" ? ("user" as const) : ("assistant" as const),
        content: m.text,
      })),
      { role: "user", content: q },
    ];

    const completionStream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.2,
      stream: true,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of completionStream) {
            const content = chunk.choices?.[0]?.delta?.content;
            if (!content) continue;
            controller.enqueue(encoder.encode(content));
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("/api/chat error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}