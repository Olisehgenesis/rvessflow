import { NextResponse } from "next/server";

const allow = "https://goodid.gooddollar.org";

function cors() {
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors() });
}

/** GoodID POSTs here when the face-check URL is built with cbu (iframe). */
export async function POST() {
  return NextResponse.json({ ok: true }, { headers: cors() });
}
