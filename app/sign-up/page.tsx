"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/browser";

function SignUpForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/onboarding";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { data, error: err } = await supabaseBrowser.auth.signUp({ email, password });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    // If email confirmations are enabled in Supabase, no session is returned and the
    // user must verify via email before signing in.
    if (!data.session) {
      setNeedsConfirm(true);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  if (needsConfirm) {
    return (
      <div className="space-y-3 text-sm text-[#1A1A1A]">
        <p>Check your inbox to confirm <strong>{email}</strong>.</p>
        <p className="text-[#6B5F4E]">After confirming, return here and sign in.</p>
        <Link href="/sign-in" className="text-[#C8571E] hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block">
        <span className="text-xs uppercase tracking-wide text-[#6B5F4E]">Email</span>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-md border border-[#E4D9C2] bg-white px-3 py-2 text-sm text-[#1A1A1A] focus:border-[#C8571E] focus:outline-none"
        />
      </label>
      <label className="block">
        <span className="text-xs uppercase tracking-wide text-[#6B5F4E]">Password</span>
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-md border border-[#E4D9C2] bg-white px-3 py-2 text-sm text-[#1A1A1A] focus:border-[#C8571E] focus:outline-none"
        />
      </label>
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-[#1A1A1A] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#2C2C2C] disabled:opacity-60"
      >
        {loading ? "Creating account…" : "Create account"}
      </button>
      <p className="text-center text-sm text-[#6B5F4E]">
        Already have an account?{" "}
        <Link href="/sign-in" className="text-[#C8571E] hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export default function SignUpPage() {
  return (
    <main className="min-h-screen bg-[#F5EFE4] flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <header className="text-center">
          <h1 className="text-3xl font-serif text-[#1A1A1A]">Cornerstone OS</h1>
          <p className="mt-1 text-sm text-[#6B5F4E]">Create your workspace.</p>
        </header>
        <div className="rounded-xl border border-[#E4D9C2] bg-[#FBF7EE] p-6 shadow-sm">
          <Suspense fallback={<div className="h-32" />}>
            <SignUpForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
