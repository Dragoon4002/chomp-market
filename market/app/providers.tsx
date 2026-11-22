"use client";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { Shell } from "@/components/ui";

export function Providers({ children }: { children: ReactNode }) {
  const [up, setUp] = useState(false);
  useEffect(() => setUp(true), []);
  if (!up) return null;
  return (
    <Suspense><Shell>{children}</Shell></Suspense>
  );
}
