"use client";

import { StudioAppShell } from "./studio-app-shell";

export function AppShell({ children }: { children: React.ReactNode }) {
  return <StudioAppShell>{children}</StudioAppShell>;
}
