"use client";

import { signOut } from "@/lib/actions";

export function SignOutForm({ className }: { className: string }) {
  return (
    <form
      action={signOut}
      onSubmit={(event) => {
        if (window.matchMedia("(min-width: 64rem)").matches && !window.confirm("Sign out of Rvess on this browser?")) {
          event.preventDefault();
        }
      }}
    >
      <button type="submit" className={className}>
        Sign out
      </button>
    </form>
  );
}
