"use client";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { Shell } from "@/components/ui";
import { WalletProviders } from "@/lib/wallet";

export function Providers({ children }: { children: ReactNode }) {
  const [up, setUp] = useState(false);
  useEffect(() => setUp(true), []);
  if (!up) return null;
  return (
    <WalletProviders><Suspense><Shell>{children}</Shell></Suspense></WalletProviders>
  );
}
