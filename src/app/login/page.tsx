"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.replace("/cases");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg2 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-line bg-card p-8 shadow-lg"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-base font-bold text-white">
            M
          </span>
          <div>
            <h1 className="text-lg font-semibold text-fg">MONARCH Maintenance</h1>
            <p className="text-sm text-muted">Sign in with your staff account</p>
          </div>
        </div>

        <label className="mt-6 block text-sm font-medium text-fg">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line2 px-3 py-2 text-base focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            autoComplete="email"
          />
        </label>

        <label className="mt-4 block text-sm font-medium text-fg">
          Password
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line2 px-3 py-2 text-base focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            autoComplete="current-password"
          />
        </label>

        {error && (
          <p className="mt-4 rounded-lg bg-bad/10 px-3 py-2 text-sm text-red-300">{error}</p>
        )}

        <Button type="submit" disabled={loading} className="mt-6 w-full text-base">
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </main>
  );
}
