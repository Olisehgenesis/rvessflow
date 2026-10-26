import { NextResponse } from "next/server";
import { OnrampConfigError, startTransak } from "@/lib/onramp-server";
import { acceptedTerms, hasEntered, viewer } from "@/lib/session";

export async function POST(request: Request) {
  if (!(await hasEntered()) || !(await acceptedTerms())) {
    return NextResponse.json({ error: "Sign in before starting a payment." }, { status: 401 });
  }
  const who = await viewer();
  const body = (await request.json().catch(() => null)) as { fiatAmount?: string } | null;
  const raw = String(body?.fiatAmount ?? "").trim();
  const fiatAmount = raw && /^\d+(\.\d{1,2})?$/.test(raw) ? Number(raw) : undefined;
  try {
    const url = await startTransak(request, who.address, fiatAmount);
    return NextResponse.json({ url });
  } catch (error) {
    if (error instanceof OnrampConfigError) {
      return NextResponse.json({ error: error.message, missing: error.missing }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : "Transak did not open.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
