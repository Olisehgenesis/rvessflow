import "server-only";

import { connection } from "next/server";

/** Live clock after this request is dynamic. Safe under Cache Components. */
export async function requestNowMs() {
  await connection();
  return Date.now();
}

export async function requestNowSeconds() {
  return Math.floor((await requestNowMs()) / 1000);
}
