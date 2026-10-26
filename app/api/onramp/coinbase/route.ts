import { NextResponse } from "next/server";
import { OnrampConfigError, startCoinbase } from "@/lib/onramp-server";
import { acceptedTerms, hasEntered, viewer } from "@/lib/session";

export async function POST(request: Request) {
  if (!(await hasEntered()) || !(await acceptedTerms())) {
    return NextResponse.json({ error: "Sign in before starting a payment." }, { status: 401 });
  }
  const who = await viewer();
  try {
    const url = await startCoinbase(request, who.address);
    return NextResponse.json({ url });
  } catch (error) {
    if (error instanceof OnrampConfigError) {
      return NextResponse.json({ error: error.message, missing: error.missing }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : "Coinbase Onramp did not open.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
