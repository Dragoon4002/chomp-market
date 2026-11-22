"use client";
import { NearProvider } from "near-connect-hooks";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { Shell } from "@/components/ui";

export function Providers({ children }: { children: ReactNode }) {
  const [up, setUp] = useState(false);
  useEffect(() => setUp(true), []);
  if (!up) return null;
  return (
    <NearProvider config={{ network: "testnet" }}>
      <Suspense><Shell>{children}</Shell></Suspense>
    </NearProvider>
  );
}
