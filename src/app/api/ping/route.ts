import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("/api/ping received:", body);
    return NextResponse.json({ ok: true, received: body });
  } catch (err) {
    console.error("/api/ping error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function GET() {
  console.log("/api/ping GET");
  return NextResponse.json({ ok: true, method: "GET" });
}
