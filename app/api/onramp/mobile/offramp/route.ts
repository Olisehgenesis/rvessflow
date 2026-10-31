import { NextResponse } from "next/server";
import { contactOf, saveEmail } from "@/lib/circle";
import { fonbnkConfirmOrder, fonbnkCreateOfframpOrder, fonbnkKycState, fonbnkQuoteOfframp } from "@/lib/fonbnk-api";
import { fonbnkLocalAmount } from "@/lib/onramp";
import { acceptedTerms, fonbnkPlace, hasEntered, viewer } from "@/lib/session";

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  if (forwarded) return forwarded;
  const real = request.headers.get("x-real-ip")?.trim() ?? "";
  return real || "127.0.0.1";
}

function publicOrigin(request: Request) {
  const host = request.headers.get("host") || "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") || (host.includes("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

function emailOf(value: string) {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Add an email in this sheet, or in Settings.");
  return email;
}

export async function POST(request: Request) {
  if (!(await hasEntered()) || !(await acceptedTerms())) {
    return NextResponse.json({ error: "Sign in before cashing out." }, { status: 401 });
  }
  const who = await viewer();
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = String(body?.action ?? "quote");
  const place = await fonbnkPlace();
  try {
    if (action === "quote") {
      const amount = Number(fonbnkLocalAmount(String(body?.amount ?? "")) || 0);
      if (!amount) throw new Error("Enter how much to cash out.");
      const email = emailOf(String(body?.email ?? (await contactOf(who.address)).email));
      if (email !== (await contactOf(who.address)).email) {
        try {
          await saveEmail(email);
        } catch {
          // Order still uses this email even if the directory is down.
        }
      }
      const quote = await fonbnkQuoteOfframp(process.env, { country: place.country, amount });
      const kyc = await fonbnkKycState(process.env, {
        email,
        country: place.country,
        callbackUrl: `${publicOrigin(request)}/home/add/mobile?side=sell`,
        depositUsd: quote.depositUsd || undefined,
        payoutUsd: quote.payoutUsd || undefined,
      });
      return NextResponse.json({ ...quote, email, country: place.country, unit: place.unit, kyc });
    }
    if (action === "order") {
      const amount = Number(fonbnkLocalAmount(String(body?.amount ?? "")) || 0);
      const email = emailOf(String(body?.email ?? ""));
      const quoteId = String(body?.quoteId ?? "");
      const channel = String(body?.channel ?? "mobile_money");
      const fields = (body?.fields && typeof body.fields === "object" ? body.fields : {}) as Record<string, string>;
      if (!quoteId) throw new Error("Quote first.");
      const order = await fonbnkCreateOfframpOrder(process.env, {
        quoteId,
        email,
        ip: clientIp(request),
        country: place.country,
        amount,
        address: who.address,
        channel,
        fields,
      });
      if (!order.to || !order.amount) throw new Error("Fonbnk did not return a deposit address. The passkey cannot send yet.");
      return NextResponse.json(order);
    }
    if (action === "confirm") {
      const orderId = String(body?.orderId ?? "");
      const hash = String(body?.hash ?? "");
      if (!orderId || !hash) throw new Error("The send hash is missing.");
      await fonbnkConfirmOrder(process.env, orderId, hash);
      return NextResponse.json({ ok: true });
    }
    throw new Error("Unknown cash-out step.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fonbnk cash out failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
