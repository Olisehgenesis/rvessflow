"use client";

import { createContext, useContext, useState } from "react";
import { Input } from "@/components/ui/input";

const GoalNameContext = createContext("");

export function useGoalName() {
  return useContext(GoalNameContext);
}

/** The name sits above the form for one saving, flow, or expense. */
export function GoalName({
  children,
  placeholder,
  fallback,
}: {
  children: React.ReactNode;
  placeholder: string;
  fallback: string;
}) {
  const [name, setName] = useState("");
  return (
    <GoalNameContext.Provider value={name.trim() || fallback}>
      <label className="mb-3 block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">Name</span>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value.slice(0, 31))}
          placeholder={placeholder}
          maxLength={31}
          className="h-9 rounded-xl border-border bg-white px-3 text-sm shadow-none"
        />
      </label>
      {children}
    </GoalNameContext.Provider>
  );
}
