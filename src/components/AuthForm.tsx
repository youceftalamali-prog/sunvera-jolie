"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AuthForm() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [f, setF] = useState({ fullName: "", phone: "", email: "", password: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: mode, ...f }),
    });
    const d = (await res.json()) as { error?: string };
    setBusy(false);
    if (!res.ok) return setErr(d.error ?? "Something went wrong");
    router.refresh();
  }

  return (
    <section className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-center font-display text-3xl">
        {mode === "login" ? "Welcome back" : "Create your account"}
      </h1>
      <p className="mt-2 text-center text-sm text-cocoa-soft">
        Track orders, save favourites and check out faster.
      </p>
      <form onSubmit={submit} className="mt-8 space-y-4 border border-cocoa/10 bg-white p-6">
        {mode === "register" && (
          <div>
            <label className="label" htmlFor="a-name">Full Name</label>
            <input id="a-name" required value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} className="inp" />
          </div>
        )}
        <div>
          <label className="label" htmlFor="a-phone">Phone Number</label>
          <input id="a-phone" required inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className="inp" />
        </div>
        {mode === "register" && (
          <div>
            <label className="label" htmlFor="a-email">Email (optional)</label>
            <input id="a-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="inp" />
          </div>
        )}
        <div>
          <label className="label" htmlFor="a-pass">Password</label>
          <input id="a-pass" type="password" required minLength={6} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className="inp" />
        </div>
        {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
        <button disabled={busy} className="btn-primary w-full">
          {mode === "login" ? "Log in" : "Create account"}
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
          className="w-full text-center text-xs text-cocoa-soft underline"
        >
          {mode === "login" ? "New here? Create an account" : "Already have an account? Log in"}
        </button>
      </form>
    </section>
  );
}
