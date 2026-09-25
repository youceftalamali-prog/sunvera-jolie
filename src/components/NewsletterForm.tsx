"use client";

import { useState } from "react";

export default function NewsletterForm({ buttonText = "Subscribe" }: { buttonText?: string }) {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await fetch("/api/newsletter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        setMsg(res.ok ? "Welcome to the Beauty Club ✨" : "Please enter a valid email.");
        if (res.ok) setEmail("");
      }}
      className="mt-3 space-y-2"
    >
      <label className="sr-only" htmlFor="nl-email">Email address</label>
      <input
        id="nl-email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Enter your email"
        className="inp !py-2.5 text-xs"
      />
      <button className="btn-gold w-full !py-2.5">{buttonText}</button>
      {msg && <p className="text-xs text-gold">{msg}</p>}
    </form>
  );
}
