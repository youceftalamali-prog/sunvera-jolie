"use client";

import { useState } from "react";

export default function ContactPage() {
  const [f, setF] = useState({ name: "", email: "", phone: "", subject: "", message: "" });
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(f),
    });
    if (res.ok) setSent(true);
    else setErr("Please check your details and try again.");
  }

  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      <h1 className="font-display text-3xl">Contact Us</h1>
      <p className="mt-2 text-sm text-cocoa-soft">
        Our beauty advisors reply within one working day.
      </p>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1.2fr_0.8fr]">
        {sent ? (
          <p className="border border-gold bg-beige p-6 text-sm">
            Thank you — your message has been received. We will get back to you shortly ✨
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4 border border-cocoa/10 bg-white p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="c-name">Name *</label>
                <input id="c-name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="inp" />
              </div>
              <div>
                <label className="label" htmlFor="c-email">Email</label>
                <input id="c-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="inp" />
              </div>
              <div>
                <label className="label" htmlFor="c-phone">Phone</label>
                <input id="c-phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className="inp" />
              </div>
              <div>
                <label className="label" htmlFor="c-subject">Subject</label>
                <input id="c-subject" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} className="inp" />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="c-msg">Message *</label>
              <textarea id="c-msg" required rows={6} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} className="inp" />
            </div>
            {err && <p className="text-sm text-red-700">{err}</p>}
            <button className="btn-primary w-full">Send message</button>
          </form>
        )}

        <aside className="space-y-5 border border-cocoa/10 bg-beige p-6 text-sm">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest">WhatsApp</p>
            <a href="https://wa.me/213000000000" className="text-cocoa-soft hover:text-gold">+213 000 000 000</a>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest">Email</p>
            <a href="mailto:care@sunverajolie.com" className="text-cocoa-soft hover:text-gold">care@sunverajolie.com</a>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest">Working hours</p>
            <p className="text-cocoa-soft">Sunday – Thursday, 9:00 – 18:00</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest">Follow us</p>
            <div className="mt-1 flex gap-3">
              <a href="https://instagram.com" aria-label="Instagram">📷</a>
              <a href="https://facebook.com" aria-label="Facebook">📘</a>
              <a href="https://tiktok.com" aria-label="TikTok">🎵</a>
              <a href="https://pinterest.com" aria-label="Pinterest">📌</a>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
