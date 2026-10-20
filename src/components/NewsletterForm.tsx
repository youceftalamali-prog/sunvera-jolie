"use client";

import { useState } from "react";

export default function NewsletterForm({ buttonText = "Subscribe" }: { buttonText?: string }) {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      action="/api/newsletter"
      method="post"
      onSubmit={async (e) => {
        e.preventDefault();
        if (submitting) return;
        setSubmitting(true);
        setMsg(null);
        try {
          const res = await fetch("/api/newsletter", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          });
          const result = await res.json().catch(() => ({}));
          if (!res.ok) {
            setMsg(typeof result.error === "string" ? result.error : "Could not subscribe right now. Please try again.");
            return;
          }
          setMsg("Welcome to the Beauty Club ✨");
          setEmail("");
        } catch {
          setMsg("Connection error. Please try again.");
        } finally {
          setSubmitting(false);
        }
      }}
      className="mt-3 space-y-2"
    >
      <label className="sr-only" htmlFor="nl-email">Email address</label>
      <input
        id="nl-email"
        name="email"
        type="email"
        required
        maxLength={254}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Enter your email"
        className="inp !py-2.5 text-xs"
      />
      <button type="submit" disabled={submitting} className="btn-gold w-full !py-2.5 disabled:opacity-60">
        {submitting ? "Subscribing…" : buttonText}
      </button>
      {msg && <p role="status" aria-live="polite" className="text-xs text-gold">{msg}</p>}
    </form>
  );
}
