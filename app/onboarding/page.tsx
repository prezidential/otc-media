"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { TEMPLATE_CATALOG, type TemplateId } from "@/lib/brand-profile/templates";

/**
 * Phase 2A M1.2 onboarding wizard.
 *
 * Four sequential steps. Each step writes via existing seed endpoints; no new
 * data flows through this page that the rest of the app couldn't already create
 * post-onboarding. The wizard is purely a guided wrapper so first-time creators
 * don't have to discover the brand-profile editor, research directive seeder,
 * and content-lanes seeder on their own.
 *
 * Visual language: cream `#F5EFE4` page, `#FBF7EE` card, `#C8571E` accent,
 * `#1A1A1A` ink, serif heading — matches the M0 onboarding page and the studio
 * shell so the transition feels continuous.
 *
 * Back navigation is allowed only between steps that have NOT yet written data.
 * Step 1 (workspace) → step 2 disables Back because the workspace insert is
 * non-trivial to undo. Step 4 also disables Back because at that point we've
 * already stamped `onboarding_completed_at`.
 */

type StepIndex = 1 | 2 | 3 | 4;

type SeedStatus = "idle" | "pending" | "done" | "error" | "skipped";

type SeedKey = "research" | "outlines" | "revenue" | "lanes";

const SEED_ENDPOINTS: Record<SeedKey, { url: string; label: string }> = {
  research: {
    url: "/api/research/seed-directives",
    label: "Research directives",
  },
  outlines: {
    url: "/api/content-outlines/seed",
    label: "Content outlines (newsletter + insider)",
  },
  revenue: { url: "/api/revenue/seed", label: "Revenue items" },
  lanes: { url: "/api/content-lanes/seed", label: "Content lanes" },
};

const PAGE_BG = "#F5EFE4";
const CARD_BG = "#FBF7EE";
const ACCENT = "#C8571E";
const INK = "#1A1A1A";
const MUTED_INK = "#6B5F4E";
const HAIRLINE = "#E4D9C2";
const SUBTLE_INK = "#8B7E6A";

export default function OnboardingPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [step, setStep] = useState<StepIndex>(1);

  // Step 1 state
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceSlug, setWorkspaceSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [step1Error, setStep1Error] = useState<string | null>(null);
  const [step1Loading, setStep1Loading] = useState(false);

  // Step 2 state
  const [template, setTemplate] = useState<TemplateId>("idj");
  const [brandName, setBrandName] = useState("");
  const [brandNameTouched, setBrandNameTouched] = useState(false);
  const [step2Error, setStep2Error] = useState<string | null>(null);
  const [step2SettingsWarning, setStep2SettingsWarning] = useState<string | null>(
    null
  );
  const [step2Loading, setStep2Loading] = useState(false);

  // Step 3 state
  const [seedStatus, setSeedStatus] = useState<Record<SeedKey, SeedStatus>>({
    research: "idle",
    outlines: "idle",
    revenue: "idle",
    lanes: "idle",
  });
  const [seedErrors, setSeedErrors] = useState<Record<SeedKey, string | null>>({
    research: null,
    outlines: null,
    revenue: null,
    lanes: null,
  });
  const [step3Running, setStep3Running] = useState(false);

  // Step 4 state
  const [step4Status, setStep4Status] = useState<"pending" | "done" | "error">(
    "pending"
  );
  const [step4Error, setStep4Error] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabaseBrowser.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      if (!data.user) {
        router.replace("/sign-in?next=/onboarding");
        return;
      }
      setEmail(data.user.email ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Seed the brand name from the workspace name once it exists, unless the user
  // typed something explicit in the step-2 input first.
  useEffect(() => {
    if (!brandNameTouched && workspaceName.trim()) {
      setBrandName(workspaceName.trim());
    }
  }, [workspaceName, brandNameTouched]);

  function onWorkspaceNameChange(v: string) {
    setWorkspaceName(v);
    if (!slugTouched) {
      setWorkspaceSlug(
        v
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 41)
      );
    }
  }

  async function submitStep1(e: React.FormEvent) {
    e.preventDefault();
    setStep1Error(null);
    setStep1Loading(true);
    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: workspaceName.trim(),
        slug: workspaceSlug.trim(),
      }),
    });
    setStep1Loading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setStep1Error(j.error || "Failed to create workspace");
      return;
    }
    const j = (await res.json().catch(() => ({}))) as {
      workspace?: { id?: string };
    };
    if (!j?.workspace?.id) {
      setStep1Error("Workspace created but response was malformed");
      return;
    }
    setWorkspaceId(j.workspace.id);
    setStep(2);
  }

  async function submitStep2() {
    setStep2Error(null);
    setStep2SettingsWarning(null);
    setStep2Loading(true);

    const seedRes = await fetch("/api/brand-profiles/seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template, name: brandName.trim() || undefined }),
    });
    if (!seedRes.ok) {
      const j = await seedRes.json().catch(() => ({}));
      setStep2Loading(false);
      setStep2Error(j.error || "Failed to create brand profile");
      return;
    }
    const seedJson = (await seedRes.json().catch(() => ({}))) as {
      brandProfile?: { id?: string };
    };
    const brandProfileId = seedJson?.brandProfile?.id ?? null;

    if (brandProfileId) {
      const settingsRes = await fetch("/api/workspace/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultBrandProfileId: brandProfileId }),
      });
      if (!settingsRes.ok) {
        const j = await settingsRes.json().catch(() => ({}));
        setStep2SettingsWarning(
          j.error ||
            "Brand profile was created but could not be set as the workspace default. You can set it later in settings."
        );
      }
    }

    setStep2Loading(false);
    setStep(3);
  }

  function skipStep2() {
    setStep2Error(null);
    setStep2SettingsWarning(null);
    setStep(3);
  }

  async function runStep3Seeds() {
    setStep3Running(true);
    const keys: SeedKey[] = ["research", "outlines", "revenue", "lanes"];
    setSeedStatus(
      keys.reduce(
        (acc, k) => {
          acc[k] = "pending";
          return acc;
        },
        { research: "pending", outlines: "pending", revenue: "pending", lanes: "pending" } as Record<SeedKey, SeedStatus>
      )
    );
    setSeedErrors({ research: null, outlines: null, revenue: null, lanes: null });

    await Promise.all(
      keys.map(async (k) => {
        const { url } = SEED_ENDPOINTS[k];
        try {
          const res = await fetch(url, { method: "POST" });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            setSeedStatus((s) => ({ ...s, [k]: "error" }));
            setSeedErrors((e) => ({
              ...e,
              [k]: j.error || `HTTP ${res.status}`,
            }));
            return;
          }
          setSeedStatus((s) => ({ ...s, [k]: "done" }));
        } catch (err) {
          setSeedStatus((s) => ({ ...s, [k]: "error" }));
          setSeedErrors((e) => ({
            ...e,
            [k]: err instanceof Error ? err.message : String(err),
          }));
        }
      })
    );
    setStep3Running(false);
  }

  function skipStep3() {
    setSeedStatus({
      research: "skipped",
      outlines: "skipped",
      revenue: "skipped",
      lanes: "skipped",
    });
    setStep(4);
  }

  function continueFromStep3() {
    setStep(4);
  }

  // Step-4 completion call. Fires once on entry; the StrictMode guard prevents
  // a double-stamp under dev double-effects.
  const completionFired = useRef(false);
  const markComplete = useCallback(async () => {
    if (completionFired.current) return;
    completionFired.current = true;
    setStep4Status("pending");
    setStep4Error(null);
    if (!workspaceId) {
      setStep4Status("error");
      setStep4Error(
        "Missing workspace context. Reload and finish from step 1 if you skipped earlier."
      );
      return;
    }
    try {
      const res = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/complete-onboarding`,
        { method: "PATCH" }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setStep4Status("error");
        setStep4Error(j.error || `HTTP ${res.status}`);
        return;
      }
      setStep4Status("done");
    } catch (err) {
      setStep4Status("error");
      setStep4Error(err instanceof Error ? err.message : String(err));
    }
  }, [workspaceId]);

  useEffect(() => {
    if (step === 4) markComplete();
  }, [step, markComplete]);

  async function onSignOut() {
    await fetch("/api/auth/sign-out", { method: "POST" });
    await supabaseBrowser.auth.signOut();
    router.replace("/sign-in");
  }

  const canGoBack = useMemo(() => {
    // Step 1 is the entry; nowhere to go back to.
    // Step 2 → 1 would be confusing once workspace exists.
    // Step 3 → 2 is allowed (brand-profile re-pick is harmless because the seed
    //   is idempotent: it no-ops if a profile already exists).
    // Step 4 is the terminus.
    return step === 3;
  }, [step]);

  return (
    <main
      className="min-h-screen flex items-start justify-center px-4 py-12"
      style={{ background: PAGE_BG }}
    >
      <div className="w-full max-w-xl space-y-6">
        <header className="text-center">
          <h1 className="text-3xl font-serif" style={{ color: INK }}>
            Welcome to Cornerstone OS
          </h1>
          {email && (
            <p className="mt-1 text-sm" style={{ color: MUTED_INK }}>
              Signed in as {email}
            </p>
          )}
          <p className="mt-3 text-xs uppercase tracking-wide" style={{ color: SUBTLE_INK }}>
            Step {step} of 4
          </p>
          <ProgressBar step={step} />
        </header>

        {step === 1 && (
          <StepCard>
            <StepHeading
              title="Create your workspace"
              subtitle="Cornerstone OS is multi-tenant. Everything you build (leads, drafts, brand voice) lives inside a workspace you own."
            />
            <form onSubmit={submitStep1} className="space-y-4">
              <Field label="Workspace name">
                <input
                  type="text"
                  required
                  value={workspaceName}
                  onChange={(e) => onWorkspaceNameChange(e.target.value)}
                  placeholder="OnTheCorner Media"
                  className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm focus:outline-none"
                  style={{
                    borderColor: HAIRLINE,
                    color: INK,
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = ACCENT)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = HAIRLINE)}
                />
              </Field>
              <Field label="Slug" hint="Lowercase letters, digits, hyphens. 2–41 characters.">
                <input
                  type="text"
                  required
                  pattern="[a-z0-9][a-z0-9\-]{1,40}"
                  value={workspaceSlug}
                  onChange={(e) => {
                    setWorkspaceSlug(e.target.value.toLowerCase());
                    setSlugTouched(true);
                  }}
                  placeholder="onthecorner-media"
                  className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm focus:outline-none font-[family-name:var(--font-geist-mono)]"
                  style={{ borderColor: HAIRLINE, color: INK }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = ACCENT)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = HAIRLINE)}
                />
              </Field>
              {step1Error && <ErrorBanner>{step1Error}</ErrorBanner>}
              <PrimaryButton
                type="submit"
                disabled={
                  step1Loading || !workspaceName.trim() || !workspaceSlug.trim()
                }
              >
                {step1Loading ? "Creating workspace…" : "Create workspace"}
              </PrimaryButton>
            </form>
          </StepCard>
        )}

        {step === 2 && (
          <StepCard>
            <StepHeading
              title="Pick a brand voice template"
              subtitle="Templates pre-fill the voice rules, forbidden patterns, and CTA preferences your drafts will follow. You can edit everything later in Brand Profile settings."
            />
            <div className="space-y-3">
              {TEMPLATE_CATALOG.map((t) => (
                <TemplateRadio
                  key={t.id}
                  selected={template === t.id}
                  onSelect={() => setTemplate(t.id)}
                  label={t.label}
                  description={t.description}
                />
              ))}
            </div>
            <div className="mt-5">
              <Field
                label="Display name"
                hint="Shown wherever the brand profile is listed. Defaults to your workspace name."
              >
                <input
                  type="text"
                  value={brandName}
                  onChange={(e) => {
                    setBrandName(e.target.value);
                    setBrandNameTouched(true);
                  }}
                  placeholder="My Brand"
                  className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm focus:outline-none"
                  style={{ borderColor: HAIRLINE, color: INK }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = ACCENT)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = HAIRLINE)}
                />
              </Field>
            </div>
            {step2Error && <ErrorBanner>{step2Error}</ErrorBanner>}
            {step2SettingsWarning && (
              <div
                className="mt-3 rounded-md border px-3 py-2 text-xs"
                style={{
                  borderColor: "#E0C58E",
                  background: "#FAF3DF",
                  color: "#6B5F1F",
                }}
              >
                {step2SettingsWarning}
              </div>
            )}
            <div className="mt-5 flex items-center justify-between">
              <SkipLink onClick={skipStep2}>Skip — set this up later</SkipLink>
              <PrimaryButton
                onClick={submitStep2}
                disabled={step2Loading}
                type="button"
              >
                {step2Loading ? "Saving…" : "Use this template"}
              </PrimaryButton>
            </div>
          </StepCard>
        )}

        {step === 3 && (
          <StepCard>
            <StepHeading
              title="Seed editorial defaults"
              subtitle="One click installs research directives, content outlines, revenue items, and content lanes. Each is idempotent — re-running won't duplicate."
            />
            <div className="space-y-2">
              {(Object.keys(SEED_ENDPOINTS) as SeedKey[]).map((k) => (
                <SeedRow
                  key={k}
                  label={SEED_ENDPOINTS[k].label}
                  status={seedStatus[k]}
                  error={seedErrors[k]}
                />
              ))}
            </div>
            <div className="mt-5 flex items-center justify-between">
              <SkipLink onClick={skipStep3}>Skip — I&apos;ll seed later</SkipLink>
              <div className="flex items-center gap-3">
                {(Object.values(seedStatus).every((s) => s === "done") ||
                  Object.values(seedStatus).some((s) => s === "error")) && (
                  <PrimaryButton type="button" onClick={continueFromStep3}>
                    Continue
                  </PrimaryButton>
                )}
                {Object.values(seedStatus).every((s) => s === "idle") && (
                  <PrimaryButton
                    type="button"
                    onClick={runStep3Seeds}
                    disabled={step3Running}
                  >
                    {step3Running ? "Seeding…" : "Seed defaults"}
                  </PrimaryButton>
                )}
                {Object.values(seedStatus).some((s) => s === "pending") && (
                  <PrimaryButton type="button" disabled>
                    Seeding…
                  </PrimaryButton>
                )}
              </div>
            </div>
          </StepCard>
        )}

        {step === 4 && (
          <StepCard>
            <Confetti />
            <StepHeading
              title="You're set up."
              subtitle="Your workspace is ready. The dashboard is where you'll triage signals, generate leads, and ship issues."
            />
            {step4Status === "pending" && (
              <p className="text-xs" style={{ color: MUTED_INK }}>
                Finalizing onboarding…
              </p>
            )}
            {step4Status === "error" && (
              <ErrorBanner>
                Couldn&apos;t stamp onboarding-complete: {step4Error}. You can
                still proceed to the dashboard.
              </ErrorBanner>
            )}
            <div className="mt-6 flex justify-end">
              <PrimaryButton
                type="button"
                onClick={() => router.replace("/dashboard")}
              >
                Go to dashboard
              </PrimaryButton>
            </div>
          </StepCard>
        )}

        <div className="flex items-center justify-between px-1">
          <div>
            {canGoBack && (
              <button
                type="button"
                onClick={() => setStep((s) => (s > 1 ? ((s - 1) as StepIndex) : s))}
                className="text-xs uppercase tracking-wide"
                style={{ color: SUBTLE_INK }}
              >
                ← Back
              </button>
            )}
          </div>
          <button
            onClick={onSignOut}
            className="text-xs uppercase tracking-wide"
            style={{ color: SUBTLE_INK }}
          >
            Sign out
          </button>
        </div>
      </div>
    </main>
  );
}

// ----- presentational pieces ------------------------------------------------

function StepCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl border p-6 shadow-sm"
      style={{ background: CARD_BG, borderColor: HAIRLINE }}
    >
      {children}
    </div>
  );
}

function StepHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-xl font-serif" style={{ color: INK }}>
        {title}
      </h2>
      <p className="mt-1 text-sm" style={{ color: MUTED_INK }}>
        {subtitle}
      </p>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wide" style={{ color: MUTED_INK }}>
        {label}
      </span>
      {children}
      {hint && (
        <span className="mt-1 block text-xs" style={{ color: SUBTLE_INK }}>
          {hint}
        </span>
      )}
    </label>
  );
}

function ProgressBar({ step }: { step: StepIndex }) {
  return (
    <div className="mt-3 flex items-center justify-center gap-1.5">
      {[1, 2, 3, 4].map((s) => (
        <span
          key={s}
          className="h-1.5 w-10 rounded-full"
          style={{
            background: s <= step ? ACCENT : HAIRLINE,
          }}
        />
      ))}
    </div>
  );
}

function PrimaryButton({
  children,
  disabled,
  type = "button",
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="rounded-md px-4 py-2 text-sm font-medium text-white transition disabled:opacity-60"
      style={{ background: INK }}
      onMouseOver={(e) => {
        if (!disabled) e.currentTarget.style.background = "#2C2C2C";
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.background = INK;
      }}
    >
      {children}
    </button>
  );
}

function SkipLink({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs uppercase tracking-wide underline-offset-2 hover:underline"
      style={{ color: SUBTLE_INK }}
    >
      {children}
    </button>
  );
}

function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {children}
    </div>
  );
}

function TemplateRadio({
  selected,
  onSelect,
  label,
  description,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full rounded-md border px-4 py-3 text-left transition"
      style={{
        background: selected ? "#FFF6E7" : "white",
        borderColor: selected ? ACCENT : HAIRLINE,
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium" style={{ color: INK }}>
          {label}
        </span>
        <span
          className="h-3 w-3 rounded-full"
          style={{
            background: selected ? ACCENT : "transparent",
            border: `1px solid ${selected ? ACCENT : HAIRLINE}`,
          }}
        />
      </div>
      <p className="mt-1 text-xs" style={{ color: MUTED_INK }}>
        {description}
      </p>
    </button>
  );
}

function SeedRow({
  label,
  status,
  error,
}: {
  label: string;
  status: SeedStatus;
  error: string | null;
}) {
  const indicator = {
    idle: { dot: HAIRLINE, text: "Not started" },
    pending: { dot: ACCENT, text: "Seeding…" },
    done: { dot: "#3F8A4B", text: "Done" },
    error: { dot: "#B23A2B", text: "Failed" },
    skipped: { dot: SUBTLE_INK, text: "Skipped" },
  }[status];

  return (
    <div
      className="flex items-start justify-between rounded-md border px-3 py-2"
      style={{ borderColor: HAIRLINE, background: "white" }}
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-1.5 inline-block h-2 w-2 rounded-full"
          style={{ background: indicator.dot }}
        />
        <div>
          <div className="text-sm" style={{ color: INK }}>
            {label}
          </div>
          {error && (
            <div className="mt-0.5 text-xs text-red-600">{error}</div>
          )}
        </div>
      </div>
      <span className="text-xs uppercase tracking-wide" style={{ color: SUBTLE_INK }}>
        {indicator.text}
      </span>
    </div>
  );
}

/**
 * Tiny zero-dependency confetti — 24 absolutely-positioned colored dots that
 * fall + spin via inline CSS keyframes. Plenty of celebratory energy without
 * pulling in `canvas-confetti` (the docs worker would have to add another env
 * footnote).
 */
function Confetti() {
  // Deterministic-but-jittered confetti layout. Using `Math.random` here would
  // trip `react-hooks/purity` (render-time impure call) and also break SSR by
  // producing a different client output. A pseudo-random sequence keyed off the
  // piece index gives enough visual variety without any randomness at all.
  const pieces = Array.from({ length: 24 }, (_, i) => {
    // hash → [0, 1) — pulled out of a 32-bit splitmix-style mixer
    const hash = (seed: number) => {
      let x = (i + 1) * 0x9e3779b1 + seed * 0x85ebca6b;
      x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
      x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
      return ((x ^ (x >>> 16)) >>> 0) / 0xffffffff;
    };
    return {
      i,
      left: hash(1) * 100,
      delay: hash(2) * 0.6,
      duration: 1.6 + hash(3) * 0.8,
      color: ["#C8571E", "#1A1A1A", "#3F8A4B", "#E0C58E", "#6B5F4E"][i % 5],
      size: 6 + hash(4) * 6,
    };
  });
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ position: "relative", height: 0 }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          height: 120,
          top: -60,
          overflow: "visible",
        }}
      >
        {pieces.map((p) => (
          <span
            key={p.i}
            style={{
              position: "absolute",
              left: `${p.left}%`,
              top: -10,
              width: p.size,
              height: p.size,
              background: p.color,
              borderRadius: 2,
              animation: `cs-confetti-fall ${p.duration}s ease-in ${p.delay}s 1 forwards`,
              transform: "rotate(0deg)",
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes cs-confetti-fall {
          0%   { transform: translateY(0) rotate(0deg);   opacity: 1; }
          100% { transform: translateY(180px) rotate(540deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
