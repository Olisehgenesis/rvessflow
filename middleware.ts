import { NextResponse, type NextRequest } from "next/server";

/** Older Celo ids used a colon (`celo:1`) which Next treats as an empty page. */
export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const marked = path.match(/^\/(goals|vaults|groups)\/(celo|base):(\d+)$/i);
  if (!marked) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = `/${marked[1]}/${marked[2].toLowerCase()}-${marked[3]}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/goals/:path*", "/vaults/:path*", "/groups/:path*"],
};
