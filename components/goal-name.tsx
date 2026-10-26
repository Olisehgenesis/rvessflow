"use client";

import { createContext, useContext, useState } from "react";
import { Input } from "@/components/ui/input";

const GoalNameContext = createContext("");

export function useGoalName() {
  return useContext(GoalNameContext);
}

/** One name for Saving, Flow, and Expense. It stays put when the tab changes. */
export function GoalName({ children }: { children: React.ReactNode }) {
  const [name, setName] = useState("");
  return (
    <GoalNameContext.Provider value={name}>
      <label className="mb-3 block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">Name</span>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Name this goal"
          className="h-9 rounded-xl border-border bg-white px-3 text-sm shadow-none"
        />
      </label>
      {children}
    </GoalNameContext.Provider>
  );
}
