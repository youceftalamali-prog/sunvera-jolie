"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AdminLogin() {
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) router.refresh();
    else setErr("Incorrect password");
  }

  return (
    <section className="mx-auto max-w-sm px-6 py-24">
      <h1 className="text-center font-display text-3xl">Admin Access</h1>
      <p className="mt-2 text-center text-xs text-cocoa-soft">SunVera Jolie management console</p>
      <form onSubmit={submit} className="mt-8 space-y-4 border border-cocoa/10 bg-white p-6">
        <div>
          <label className="label" htmlFor="ap">Password</label>
          <input id="ap" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="inp" />
        </div>
        {err && <p className="text-sm text-red-700">{err}</p>}
        <button className="btn-primary w-full">Enter dashboard</button>
        <p className="text-[11px] text-cocoa-soft">
          Set <code>ADMIN_PASSWORD</code> in your environment variables to change this password.
        </p>
      </form>
    </section>
  );
}
