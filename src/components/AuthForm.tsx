"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export function AuthForm({ mode }: { mode: "signup" | "login" }) {
  const router = useRouter();
  const params = useSearchParams();
  const scanToken = params.get("scan");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function afterAuth() {
    if (scanToken) {
      const res = await fetch(`/api/scan/${scanToken}/claim`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        router.push(`/sites/${data.siteId}`);
        return;
      }
    }
    router.push("/dashboard");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const fn =
      mode === "signup"
        ? authClient.signUp.email({ email, password, name: email.split("@")[0] })
        : authClient.signIn.email({ email, password });
    const { error: err } = await fn;
    if (err) {
      setError(err.message ?? "Something went wrong.");
      setBusy(false);
      return;
    }
    await afterAuth();
  }

  const other = scanToken ? `?scan=${scanToken}` : "";

  return (
    <div className="mx-auto mt-20 w-full max-w-sm">
      <h1 className="text-[24px] font-semibold tracking-[-0.02em]">
        {mode === "signup" ? "Create your account" : "Welcome back"}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {mode === "signup"
          ? scanToken
            ? "Your scan is ready. Sign up to see every link and go live."
            : "Free and open source. No card needed."
          : "Sign in to your dashboard."}
      </p>

      <form onSubmit={submit} className="mt-6 space-y-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          className="card w-full rounded-lg px-3.5 py-2.5 text-[15px] outline-none placeholder:text-faint focus:border-line2"
        />
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={mode === "signup" ? "Password (8+ characters)" : "Password"}
          className="card w-full rounded-lg px-3.5 py-2.5 text-[15px] outline-none placeholder:text-faint focus:border-line2"
        />
        <button type="submit" disabled={busy} className="btn btn-primary w-full justify-center">
          {busy ? "One moment..." : mode === "signup" ? "Create account" : "Sign in"}
        </button>
      </form>
      {error && <p className="mt-3 text-sm text-bad">{error}</p>}

      <p className="mt-6 text-sm text-muted">
        {mode === "signup" ? (
          <>
            Already have an account?{" "}
            <Link href={`/login${other}`} className="text-body underline underline-offset-4 hover:text-accent">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link href={`/signup${other}`} className="text-body underline underline-offset-4 hover:text-accent">
              Create an account
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
