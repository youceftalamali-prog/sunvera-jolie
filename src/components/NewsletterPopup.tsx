"use client";

import { useEffect, useState } from "react";

export default function NewsletterPopup({
  settings,
}: {
  settings?: { enabled: boolean; imageUrl: string; heading: string; description: string; discountCode: string; buttonText: string };
}) {
  const cfg = settings ?? {
    enabled: true,
    imageUrl: "",
    heading: "Get 10% Off Your First Order",
    description: "Join our beauty community and discover new arrivals, exclusive offers and beauty inspiration.",
    discountCode: "WELCOME10",
    buttonText: "Get My 10% Off",
  };
  const [show, setShow] = useState(false);
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!cfg.enabled) return;
    if (localStorage.getItem("svj_nl") === "1") return;
    const t = setTimeout(() => setShow(true), 12000);
    return () => clearTimeout(t);
  }, [cfg.enabled]);

  function close() {
    setShow(false);
    localStorage.setItem("svj_nl", "1");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/newsletter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    localStorage.setItem("svj_nl", "1");
    setDone(true);
  }

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-cocoa/40 p-4" role="dialog" aria-modal="true">
      <div className="relative w-full max-w-md bg-ivory p-8 text-center">
        <button onClick={close} aria-label="Close" className="absolute end-4 top-3 text-sm">✕</button>
        {done ? (
          <>
            <h2 className="font-display text-2xl">Welcome ✨</h2>
            <p className="mt-3 text-sm text-cocoa-soft">
              Use code <span className="font-semibold text-gold">{cfg.discountCode}</span> at checkout for 10% off.
            </p>
            <button onClick={close} className="btn-primary mt-6">Start shopping</button>
          </>
        ) : (
          <>
            <p className="text-[10px] uppercase tracking-[0.3em] text-gold">SunVera Jolie</p>
            <h2 className="mt-3 font-display text-2xl">{cfg.heading}</h2>
            <p className="mt-3 text-sm text-cocoa-soft">
              {cfg.description}
            </p>
            <form onSubmit={submit} className="mt-5 space-y-3">
              <label className="sr-only" htmlFor="pop-email">Email</label>
              <input id="pop-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email" className="inp text-center" />
              <button className="btn-gold w-full">{cfg.buttonText}</button>
            </form>
            <button onClick={close} className="mt-4 text-[11px] text-cocoa-soft underline">No thanks</button>
          </>
        )}
      </div>
    </div>
  );
}
