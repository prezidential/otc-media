"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type StudioUIValue = {
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;
  openCommandPalette: () => void;
};

const StudioUIContext = createContext<StudioUIValue | null>(null);

export function StudioUIProvider({ children }: { children: ReactNode }) {
  const [commandOpen, setCommandOpen] = useState(false);
  const openCommandPalette = useCallback(() => setCommandOpen(true), []);

  const value = useMemo(
    () => ({
      commandOpen,
      setCommandOpen,
      openCommandPalette,
    }),
    [commandOpen]
  );

  return <StudioUIContext.Provider value={value}>{children}</StudioUIContext.Provider>;
}

export function useStudioUI(): StudioUIValue {
  const ctx = useContext(StudioUIContext);
  if (!ctx) {
    throw new Error("useStudioUI must be used within StudioUIProvider");
  }
  return ctx;
}
