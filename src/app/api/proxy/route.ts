import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const endpoint = process.env.AWS_API_ENDPOINT!;
    const body = await req.text();
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      cache: 'no-store',
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('content-type') || 'application/json' },
    });
  } catch (e) {
    const error = e as Error;
    return NextResponse.json({ success: false, error: error?.message || 'proxy_error' }, { status: 500 });
  }
}
