"use client";

import dynamic from "next/dynamic";

export const LoginGate = dynamic(() => import("@/components/login-panel").then((mod) => mod.LoginPanel), {
  ssr: false,
  loading: () => <div className="h-[28rem]" />,
});
