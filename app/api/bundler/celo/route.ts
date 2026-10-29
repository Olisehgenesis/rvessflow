import { cookies } from "next/headers";
import { withCeloSponsorshipPolicy } from "@/lib/celo-sponsor";

const methodCookie = "rvess-auth";

function pimlicoCeloUrl() {
  const key = process.env.PIMLICO_API_KEY?.trim();
  if (!key) return null;
  return `https://api.pimlico.io/v2/42220/rpc?apikey=${encodeURIComponent(key)}`;
}

function rpcError(id: unknown, message: string, status: number) {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, error: { code: -32000, message } }, { status });
}

export async function POST(request: Request) {
  const jar = await cookies();
  const method = jar.get(methodCookie)?.value;
  if (method !== "passkey" && method !== "wallet") {
    return rpcError(null, "Sign in first.", 401);
  }
  const url = pimlicoCeloUrl();
  if (!url) return rpcError(null, "Celo bundler is not configured.", 503);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return rpcError(null, "Parse error.", 400);
  }
  const upstream = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(withCeloSponsorshipPolicy(body)),
  });
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") || "application/json" },
  });
}
