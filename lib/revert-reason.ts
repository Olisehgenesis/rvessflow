import { BaseError } from "viem";

const lines: Record<string, string> = {
  "0xfa3505cf": "Earn yield isn't funded for this token yet. Leave it off and create the lock.",
  "0x1dc930eb": "The vault did not receive enough after the protocol fee to open the stream. Try again.",
  "0x4239717c": "This account already has a vault. Wait a moment and create the flow again.",
};

export function knownRevert(text: string): string | null {
  const found = text.toLowerCase().match(/0x[0-9a-f]{8}/g) ?? [];
  for (const selector of found) {
    const line = lines[selector];
    if (line) return line;
  }
  return null;
}

export function explainRevert(error: unknown): string {
  const parts: string[] = [];
  if (error instanceof BaseError) {
    error.walk((item) => {
      if (item instanceof Error) parts.push(item.message);
      if (item && typeof item === "object" && "data" in item && typeof item.data === "string") parts.push(item.data);
      return false;
    });
  } else if (error instanceof Error) {
    parts.push(error.message);
  } else {
    parts.push(String(error));
  }
  return knownRevert(parts.join("\n")) ?? "The transaction reverted.";
}
