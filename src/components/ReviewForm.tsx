"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ReviewForm({ productId }: { productId: number }) {
  const [name, setName] = useState("");
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [done, setDone] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, customerName: name, rating, body }),
    });
    if (res.ok) {
      setDone(true);
      setBody("");
      setName("");
      router.refresh();
    }
  }

  if (done) return <p className="text-sm text-gold">Thank you — your review has been published ✨</p>;

  return (
    <form onSubmit={submit} className="mt-6 space-y-3 border border-cocoa/10 bg-white p-5">
      <h3 className="font-display text-lg">Write a review</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="rv-name">Your name</label>
          <input id="rv-name" required value={name} onChange={(e) => setName(e.target.value)} className="inp" />
        </div>
        <div>
          <label className="label" htmlFor="rv-rating">Rating</label>
          <select id="rv-rating" value={rating} onChange={(e) => setRating(Number(e.target.value))} className="inp">
            {[5, 4, 3, 2, 1].map((r) => (
              <option key={r} value={r}>{"★".repeat(r)}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="rv-body">Your review</label>
        <textarea id="rv-body" required rows={4} value={body} onChange={(e) => setBody(e.target.value)} className="inp" />
      </div>
      <button className="btn-primary">Submit review</button>
    </form>
  );
}
