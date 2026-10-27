"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorNote } from "@/components/ui-bits";
import { joinGroup } from "@/lib/actions";

export function JoinForm({ code }: { code: string }) {
  const [state, action, pending] = useActionState(joinGroup, null);
  return (
    <form action={action} className="space-y-4">
      <label className="block space-y-1.5">
        <Label htmlFor="code">Group code</Label>
        <Input id="code" name="code" defaultValue={code} placeholder="ABC123" autoCapitalize="characters" className="h-12 rounded-2xl border-border bg-white px-4 text-base uppercase shadow-none" />
      </label>
      <ErrorNote error={state?.error} />
      <Button type="submit" disabled={pending} className="h-12 w-full rounded-full text-base">
        {pending ? "Looking…" : "Join group"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">Or</p>
      <Link href="/groups/join/scan" className="inline-flex h-12 w-full items-center justify-center rounded-full border border-border text-sm font-medium">
        Scan QR code
      </Link>
    </form>
  );
}
