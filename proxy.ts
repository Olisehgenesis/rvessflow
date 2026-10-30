import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const local = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  if (!local && request.headers.get("x-forwarded-proto") === "http") {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    return NextResponse.redirect(url, 308);
  }
  const marked = request.nextUrl.pathname.match(/^\/(goals|vaults|groups)\/(celo|base):(\d+)$/i);
  if (marked) {
    const url = request.nextUrl.clone();
    url.pathname = `/${marked[1]}/${marked[2].toLowerCase()}-${marked[3]}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
