"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

/**
 * Phase 2A M0 onboarding page — collects only workspace name + slug and creates
 * the workspace via /api/workspaces. The full M1 wizard (brand voice template,
 * LinkedIn connect, editorial setup) replaces this with a multi-step flow.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  function onNameChange(v: string) {
    setName(v);
    if (!slugTouched) {
      setSlug(
        v
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 41)
      );
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), slug: slug.trim() }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Failed to create workspace");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  async function onSignOut() {
    await fetch("/api/auth/sign-out", { method: "POST" });
    await supabaseBrowser.auth.signOut();
    router.replace("/sign-in");
  }

  return (
    <main className="min-h-screen bg-[#F5EFE4] flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <header className="text-center">
          <h1 className="text-3xl font-serif text-[#1A1A1A]">Welcome to Cornerstone OS</h1>
          {email && <p className="mt-1 text-sm text-[#6B5F4E]">Signed in as {email}</p>}
          <p className="mt-3 text-sm text-[#6B5F4E]">
            Create your first workspace to continue.
          </p>
        </header>

        <form
          onSubmit={onSubmit}
          className="rounded-xl border border-[#E4D9C2] bg-[#FBF7EE] p-6 shadow-sm space-y-4"
        >
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-[#6B5F4E]">
              Workspace name
            </span>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="OnTheCorner Media"
              className="mt-1 w-full rounded-md border border-[#E4D9C2] bg-white px-3 py-2 text-sm text-[#1A1A1A] focus:border-[#C8571E] focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-[#6B5F4E]">Slug</span>
            <input
              type="text"
              required
              pattern="[a-z0-9][a-z0-9\-]{1,40}"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value.toLowerCase());
                setSlugTouched(true);
              }}
              placeholder="onthecorner-media"
              className="mt-1 w-full rounded-md border border-[#E4D9C2] bg-white px-3 py-2 text-sm text-[#1A1A1A] focus:border-[#C8571E] focus:outline-none font-[family-name:var(--font-geist-mono)]"
            />
            <span className="mt-1 block text-xs text-[#8B7E6A]">
              Lowercase letters, digits, hyphens. 2&ndash;41 characters.
            </span>
          </label>
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading || !name.trim() || !slug.trim()}
            className="w-full rounded-md bg-[#1A1A1A] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#2C2C2C] disabled:opacity-60"
          >
            {loading ? "Creating workspace…" : "Create workspace"}
          </button>
        </form>

        <div className="text-center">
          <button
            onClick={onSignOut}
            className="text-xs uppercase tracking-wide text-[#8B7E6A] hover:text-[#1A1A1A]"
          >
            Sign out
          </button>
        </div>
      </div>
    </main>
  );
}
