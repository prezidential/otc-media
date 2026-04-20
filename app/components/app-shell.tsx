"use client";

import { usePathname } from "next/navigation";
import { StudioAppShell } from "./studio-app-shell";

const SHELL_BYPASS_PREFIXES = ["/sign-in", "/sign-up", "/onboarding"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bypass = SHELL_BYPASS_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
  if (bypass) {
    return <>{children}</>;
  }
  return <StudioAppShell>{children}</StudioAppShell>;
}
