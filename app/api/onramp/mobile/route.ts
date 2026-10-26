import { NextResponse } from "next/server";
import { OnrampConfigError, startKotaniOnramp } from "@/lib/onramp-server";
import { readAccountName, readMobileNetwork, readUgx, ugandaPhone } from "@/lib/onramp";
import { acceptedTerms, hasEntered, viewer } from "@/lib/session";

export async function POST(request: Request) {
  if (!(await hasEntered()) || !(await acceptedTerms())) {
    return NextResponse.json({ error: "Sign in before starting a payment." }, { status: 401 });
  }
  const who = await viewer();
  const body = (await request.json().catch(() => null)) as { network?: string; phone?: string; name?: string; amount?: string } | null;
  try {
    const result = await startKotaniOnramp({
      network: readMobileNetwork(String(body?.network ?? "")),
      phoneNumber: ugandaPhone(String(body?.phone ?? "")),
      accountName: readAccountName(String(body?.name ?? "")),
      fiatAmount: readUgx(String(body?.amount ?? "")),
      receiverAddress: who.address,
      referenceId: `rvess-${crypto.randomUUID()}`,
      callbackUrl: process.env.KOTANI_CALLBACK_URL || undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof OnrampConfigError) {
      return NextResponse.json({ error: error.message, missing: error.missing }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : "The mobile-money request failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
