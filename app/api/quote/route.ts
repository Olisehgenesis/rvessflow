import { NextResponse } from "next/server";
import { loadQuoteFor } from "@/lib/rates";
import { CURRENCIES } from "@/lib/quote";

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code") ?? "";
  const known = CURRENCIES.some((item) => item.code === code);
  if (!known) return NextResponse.json({ error: "Unknown currency." }, { status: 400 });
  return NextResponse.json(await loadQuoteFor(code));
}
