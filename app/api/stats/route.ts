import { NextResponse } from "next/server";
import { loadProtocolStats } from "@/lib/protocol-stats";
import { toWire } from "@/lib/protocol-stats-view";

export const maxDuration = 30;

export async function GET() {
  const data = await loadProtocolStats();
  return NextResponse.json(toWire(data));
}
