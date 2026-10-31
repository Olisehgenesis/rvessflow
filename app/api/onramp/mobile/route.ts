import { NextResponse } from "next/server";
import { OnrampConfigError, startFonbnkWidget } from "@/lib/onramp-server";
import { fonbnkCountry, fonbnkLocalAmount } from "@/lib/onramp";
import { acceptedTerms, hasEntered, viewer } from "@/lib/session";

export async function POST(request: Request) {
  if (!(await hasEntered()) || !(await acceptedTerms())) {
    return NextResponse.json({ error: "Sign in before starting a payment." }, { status: 401 });
  }
  const who = await viewer();
  const body = (await request.json().catch(() => null)) as { side?: string; country?: string; amount?: string } | null;
  try {
    const url = await startFonbnkWidget(request, {
      side: body?.side === "sell" ? "sell" : "buy",
      address: who.address,
      amount: fonbnkLocalAmount(String(body?.amount ?? "")),
      countryIsoCode: fonbnkCountry(String(body?.country ?? "")),
    });
    return NextResponse.json({ url });
  } catch (error) {
    if (error instanceof OnrampConfigError) {
      return NextResponse.json({ error: error.message, missing: error.missing }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : "Fonbnk did not open.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
