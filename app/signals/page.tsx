"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "../components/page-header";
import { cn } from "@/lib/utils";
import { studioInner, studioTab } from "@/lib/studio/inner-classes";
import { ResearchSetupTab } from "./ResearchSetupTab";
import { SignalFeedTab } from "./SignalFeedTab";

type Tab = "setup" | "feed";

export default function SignalsPage() {
  const [tab, setTab] = useState<Tab>("setup");

  return (
    <div className={studioInner.pageRoot}>
      <PageHeader
        variant="studio"
        title="Signals"
        description="Configure research intent, manage sources, and browse the signal feed."
      />

      {/* Pipeline breadcrumb */}
      <div className={cn(studioInner.cardPadSm, "mb-4 flex flex-wrap items-center gap-3")}>
        <div className={studioInner.sectionLabel}>Pipeline</div>
        <nav className="flex flex-wrap items-center gap-x-1 gap-y-1 text-[13px] text-[#1F1A14]">
          <Link href="/signals" className={studioInner.link}>Research</Link>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#9C8E78]" />
          <Link href="/leads" className={studioInner.link}>Leads</Link>
          <span className="text-[#6B5F4E] hidden sm:inline">(approve)</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#9C8E78]" />
          <Link href="/issues" className={studioInner.link}>Issues</Link>
          <span className="text-[#6B5F4E] hidden sm:inline">(draft)</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#9C8E78]" />
          <Link href="/outlines" className={studioInner.link}>Outlines</Link>
        </nav>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-[#E4D9C2]">
        <nav className="flex">
          <button
            type="button"
            onClick={() => setTab("setup")}
            className={studioTab(tab === "setup")}
          >
            Research Setup
          </button>
          <button
            type="button"
            onClick={() => setTab("feed")}
            className={studioTab(tab === "feed")}
          >
            Signal Feed
          </button>
        </nav>
      </div>

      {tab === "setup" && <ResearchSetupTab />}
      {tab === "feed" && <SignalFeedTab />}
    </div>
  );
}
