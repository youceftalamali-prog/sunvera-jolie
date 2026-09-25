import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FAQ — Delivery, Returns & Products",
  description: "Answers about delivery times, cash on delivery, order tracking, returns and product authenticity at SunVera Jolie.",
};

const FAQS: [string, string][] = [
  ["How long does delivery take?", "Orders are prepared within 24 hours. Delivery takes 1-2 days in Alger, 2-4 days in most northern wilayas and 4-8 days in the south. You will receive a call before the courier arrives."],
  ["Do you offer Cash on Delivery?", "Yes. Cash on Delivery is available in every Algerian wilaya — you pay the courier only when your parcel is in your hands. Card payment will be added later."],
  ["How can I track my order?", "Go to Track My Order, enter the order number you received (for example SVJ-XXXXXXXX) together with the phone number used at checkout, and you will see the live status of your parcel."],
  ["How can I return a product?", "Unopened products in their original packaging can be returned within 14 days of delivery. Contact us on WhatsApp with your order number and we will arrange the pickup. Refunds are issued once the item is received."],
  ["Are your products original?", "Yes. Every product in the SunVera Jolie collection is sourced from authorised suppliers and checked before dispatch. We never sell imitations."],
  ["How can I contact support?", "Message us on WhatsApp at +213 000 000 000, write to care@sunverajolie.com, or use the contact form. We reply within one working day."],
  ["How do I choose the right product?", "Use the filters on the shop page for your skin or hair type, or open the SunVera Jolie AI beauty assistant and describe your concern — it will suggest a ritual from our catalogue. It offers cosmetic guidance only, never medical advice."],
  ["Is there free delivery?", "Yes — delivery is free on every order above 9 000 DA, anywhere in Algeria."],
];

export default function FaqPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-display text-3xl">Frequently Asked Questions</h1>
      <div className="mt-8 space-y-3">
        {FAQS.map(([q, a]) => (
          <details key={q} className="border border-cocoa/10 bg-white p-5">
            <summary className="cursor-pointer text-sm font-medium">{q}</summary>
            <p className="mt-3 text-sm leading-relaxed text-cocoa-soft">{a}</p>
          </details>
        ))}
      </div>
      <script
        type="application/ld+json"
         
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQS.map(([q, a]) => ({
              "@type": "Question",
              name: q,
              acceptedAnswer: { "@type": "Answer", text: a },
            })),
          }),
        }}
      />
    </section>
  );
}
