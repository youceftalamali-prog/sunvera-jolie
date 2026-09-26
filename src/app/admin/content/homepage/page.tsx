"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { uploadMediaFiles } from "@/components/admin/uploadMedia";
import MediaPicker, { type PickedMedia } from "@/components/admin/MediaPicker";
import AIDesignAssistant from "@/components/admin/AIDesignAssistant";
import { DEFAULT_SECTION_TYPOGRAPHY, FONT_OPTIONS, normalizeSectionTypography, type SectionTypography } from "@/lib/typography";

type Section = {
  id: number;
  key: string;
  label: string;
  enabled: boolean;
  sortOrder: number;
  title: string;
  subtitle: string;
  body: string;
  imageUrl: string;
  imageMobileUrl: string;
  imageTabletUrl: string;
  buttonText: string;
  buttonUrl: string;
  button2Text: string;
  button2Url: string;
  background: string;
  textColor: string;
  textPosition: string;
  overlayOpacity: number;
  productMode: string;
  productCount: number;
  productIds: number[];
  items: { icon?: string; title: string; text?: string; url?: string; image?: string; rating?: number; verified?: boolean }[];
  settings: Record<string, unknown>;
};

type HeroSlide = {
  image: string;
  mobileImage?: string;
  title: string;
  subtitle?: string;
  buttonText?: string;
  buttonUrl?: string;
  button2Text?: string;
  button2Url?: string;
  textPosition?: "left" | "center" | "right";
  overlayOpacity?: number;
};

type HeroSettings = {
  logoUrl?: string;
  autoplay?: boolean;
  intervalMs?: number;
  transition?: "fade" | "slide";
  slides?: HeroSlide[];
};

type Banner = {
  id: number;
  title: string;
  subtitle: string;
  imageDesktop: string;
  imageMobile: string;
  buttonText: string;
  buttonUrl: string;
  active: boolean;
  sortOrder: number;
  startsAt: string | null;
  endsAt: string | null;
};

type Badge = { id: number; icon: string; title: string; description: string; active: boolean; sortOrder: number };
type ProductLite = { id: number; name: string; price: number; status: string };

export default function HomepageEditor() {
  const [sections, setSections] = useState<Section[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaTarget, setMediaTarget] = useState<{ folder: string; apply: (url: string) => Promise<void> } | null>(null);
  const dragIndex = useRef<number | null>(null);

  const load = useCallback(async () => {
    const [s, b, p] = await Promise.all([
      fetch("/api/admin/cms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "sections-list" }),
      }).then((r) => r.json()),
      fetch("/api/admin/data?type=products").then((r) => r.json()),
      fetch("/api/admin/data?type=products").then((r) => r.json()),
    ]);
    void b;
    setSections((s as { sections: Section[] }).sections ?? []);
    setProducts((p as { products: ProductLite[] }).products ?? []);
  }, []);

  const loadMarketing = useCallback(async () => {
    const res = await fetch("/api/admin/marketing-data");
    if (!res.ok) return;
    const d = (await res.json()) as { banners: Banner[]; badges: Badge[] };
    setBanners(d.banners ?? []);
    setBadges(d.badges ?? []);
  }, []);

  useEffect(() => {
    void load();
    void loadMarketing();
  }, [load, loadMarketing]);

  const active = sections.find((s) => s.id === activeId) ?? null;

  async function save(patch: Partial<Section>, id = activeId) {
    if (!id) return;
    await fetch("/api/admin/cms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "section-update", id, ...patch }),
    });
    setMsg("Saved ✓");
    void load();
  }

  async function reorder(next: Section[]) {
    setSections(next.map((s, i) => ({ ...s, sortOrder: i })));
    await fetch("/api/admin/cms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "section-reorder", order: next.map((s) => s.id) }),
    });
    setMsg("Section order saved ✓");
  }

  // The media API already returns a ready-to-use URL for every provider.
  async function uploadImage(file: File, folder: string) {
    const res = await uploadMediaFiles({ files: [file], folder });
    return res.created?.[0]?.url ?? "";
  }

  function openMediaPicker(folder: string, apply: (url: string) => Promise<void>) {
    setMediaTarget({ folder, apply });
    setMediaPickerOpen(true);
  }

  function heroSettings(section: Section): HeroSettings {
    const raw = section.settings;
    return raw && typeof raw === "object" ? raw as HeroSettings : {};
  }

  function sectionTypography(section: Section) {
    const raw = section.settings?.typography;
    return normalizeSectionTypography(raw);
  }

  async function saveSectionTypography(section: Section, patch: Partial<SectionTypography>) {
    await save({
      settings: {
        ...section.settings,
        typography: { ...sectionTypography(section), ...patch },
      },
    });
  }

  function heroSlides(section: Section): HeroSlide[] {
    const configured = heroSettings(section).slides ?? [];
    if (configured.length) return configured;
    return [{
      image: section.imageUrl || "/images/hero.jpg",
      mobileImage: section.imageMobileUrl || undefined,
      title: section.title,
      subtitle: section.subtitle,
      buttonText: section.buttonText,
      buttonUrl: section.buttonUrl,
      button2Text: section.button2Text,
      button2Url: section.button2Url,
      textPosition: section.textPosition === "center" || section.textPosition === "right" ? section.textPosition : "left",
      overlayOpacity: section.overlayOpacity,
    }];
  }

  async function saveHeroSettings(section: Section, patch: Partial<HeroSettings>) {
    await save({ settings: { ...heroSettings(section), ...patch } });
  }

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl">Homepage CMS</h1>
        <Link href="/" target="_blank" className="btn-outline ms-auto !py-2">Preview homepage</Link>
      </div>
      {msg && <p className="border border-green-200 bg-green-50 p-3 text-[12px] text-green-800">{msg}</p>}
      <AIDesignAssistant />

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="bg-white p-4">
          <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[var(--svj-muted)]">
            Sections — drag to reorder
          </h2>
          <ul className="mt-3 space-y-1">
            {sections.map((s, i) => (
              <li
                key={s.id}
                draggable
                onDragStart={() => (dragIndex.current = i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragIndex.current === null) return;
                  const next = [...sections];
                  const [moved] = next.splice(dragIndex.current, 1);
                  next.splice(i, 0, moved);
                  dragIndex.current = null;
                  void reorder(next);
                }}
                className={`flex items-center gap-2 px-2 py-2 text-[12px] ${activeId === s.id ? "bg-[var(--svj-background)]" : ""}`}
              >
                <span className="cursor-grab" title="Drag to reorder">☰</span>
                <button onClick={() => setActiveId(s.id)} className="flex-1 text-start">{s.label}</button>
                <label className="flex items-center gap-1 text-[10px]">
                  <input type="checkbox" checked={s.enabled} onChange={(e) => save({ enabled: e.target.checked }, s.id)} />
                  on
                </label>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-6">
          {!active && <p className="bg-white p-6 text-[12px] text-[var(--svj-muted)]">Select a section on the left to edit its content.</p>}

          {active && (
            <section className="bg-white p-5">
              <h2 className="text-[12px] font-semibold uppercase tracking-widest">Edit · {active.label}</h2>
              <div className="mt-5 border-t border-[var(--svj-border)] pt-5">
                {(() => {
                  const typography = sectionTypography(active);
                  return (
                    <>
                      <div>
                        <h3 className="text-[11px] font-semibold uppercase tracking-widest">Section Typography</h3>
                        <p className="mt-1 text-[10px] text-[var(--svj-muted)]">
                          Each homepage section can use its own English or Arabic-friendly font, size and colors.
                        </p>
                      </div>

                      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {([
                          ["headingFont", "Heading font"],
                          ["bodyFont", "Body font"],
                          ["buttonFont", "Button font"],
                        ] as ["headingFont" | "bodyFont" | "buttonFont", string][]).map(([key, label]) => (
                          <label key={key} className="block">
                            <span className="label">{label}</span>
                            <select
                              value={String(typography[key])}
                              onChange={(e) => void saveSectionTypography(active, { [key]: e.target.value })}
                              className="inp"
                              style={{
                                fontFamily: key === "headingFont"
                                  ? FONT_OPTIONS.find((f) => f.id === typography.headingFont)?.stack
                                  : key === "bodyFont"
                                    ? FONT_OPTIONS.find((f) => f.id === typography.bodyFont)?.stack
                                    : FONT_OPTIONS.find((f) => f.id === typography.buttonFont)?.stack,
                              }}
                            >
                              {(["Luxury Serif", "Modern Sans", "Arabic", "Universal"] as const).map((category) => (
                                <optgroup key={category} label={category}>
                                  {FONT_OPTIONS.filter((font) => font.category === category).map((font) => (
                                    <option key={font.id} value={font.id}>{font.label}</option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                          </label>
                        ))}

                        <label className="block">
                          <span className="label">Heading size · {typography.headingSize}px</span>
                          <input
                            key={String(typography.headingSize)}
                            type="range"
                            min="20"
                            max="72"
                            step="1"
                            defaultValue={typography.headingSize}
                            onMouseUp={(e) => void saveSectionTypography(active, { headingSize: Number((e.target as HTMLInputElement).value) })}
                            className="w-full"
                          />
                        </label>

                        <label className="block">
                          <span className="label">Body size · {typography.bodySize}px</span>
                          <input
                            key={String(typography.bodySize)}
                            type="range"
                            min="10"
                            max="28"
                            step="1"
                            defaultValue={typography.bodySize}
                            onMouseUp={(e) => void saveSectionTypography(active, { bodySize: Number((e.target as HTMLInputElement).value) })}
                            className="w-full"
                          />
                        </label>

                        <label className="block">
                          <span className="label">Button size · {typography.buttonSize}px</span>
                          <input
                            key={String(typography.buttonSize)}
                            type="range"
                            min="9"
                            max="20"
                            step="1"
                            defaultValue={typography.buttonSize}
                            onMouseUp={(e) => void saveSectionTypography(active, { buttonSize: Number((e.target as HTMLInputElement).value) })}
                            className="w-full"
                          />
                        </label>

                        <label className="block">
                          <span className="label">Heading color</span>
                          <div className="flex gap-2">
                            <input
                              type="color"
                              value={typography.headingColor}
                              onChange={(e) => void saveSectionTypography(active, { headingColor: e.target.value })}
                              className="h-10 w-14 border border-[var(--svj-border)]"
                            />
                            <input
                              value={typography.headingColor}
                              onBlur={(e) => void saveSectionTypography(active, { headingColor: e.target.value })}
                              className="inp !py-2 text-xs"
                            />
                          </div>
                        </label>

                        <label className="block">
                          <span className="label">Body text color</span>
                          <div className="flex gap-2">
                            <input
                              type="color"
                              value={typography.bodyColor}
                              onChange={(e) => void saveSectionTypography(active, { bodyColor: e.target.value })}
                              className="h-10 w-14 border border-[var(--svj-border)]"
                            />
                            <input
                              value={typography.bodyColor}
                              onBlur={(e) => void saveSectionTypography(active, { bodyColor: e.target.value })}
                              className="inp !py-2 text-xs"
                            />
                          </div>
                        </label>

                        <label className="block">
                          <span className="label">Button background</span>
                          <div className="flex gap-2">
                            <input
                              type="color"
                              value={typography.buttonColor}
                              onChange={(e) => void saveSectionTypography(active, { buttonColor: e.target.value })}
                              className="h-10 w-14 border border-[var(--svj-border)]"
                            />
                            <input
                              value={typography.buttonColor}
                              onBlur={(e) => void saveSectionTypography(active, { buttonColor: e.target.value })}
                              className="inp !py-2 text-xs"
                            />
                          </div>
                        </label>

                        <label className="block">
                          <span className="label">Button text color</span>
                          <div className="flex gap-2">
                            <input
                              type="color"
                              value={typography.buttonTextColor}
                              onChange={(e) => void saveSectionTypography(active, { buttonTextColor: e.target.value })}
                              className="h-10 w-14 border border-[var(--svj-border)]"
                            />
                            <input
                              value={typography.buttonTextColor}
                              onBlur={(e) => void saveSectionTypography(active, { buttonTextColor: e.target.value })}
                              className="inp !py-2 text-xs"
                            />
                          </div>
                        </label>

                        <label className="block">
                          <span className="label">Heading weight · {typography.headingWeight}</span>
                          <input
                            key={String(typography.headingWeight)}
                            type="range"
                            min="300"
                            max="900"
                            step="100"
                            defaultValue={typography.headingWeight}
                            onMouseUp={(e) => void saveSectionTypography(active, { headingWeight: Number((e.target as HTMLInputElement).value) })}
                            className="w-full"
                          />
                        </label>

                        <label className="block">
                          <span className="label">Letter spacing · {typography.letterSpacing.toFixed(2)}em</span>
                          <input
                            key={String(typography.letterSpacing)}
                            type="range"
                            min="-0.05"
                            max="0.20"
                            step="0.01"
                            defaultValue={typography.letterSpacing}
                            onMouseUp={(e) => void saveSectionTypography(active, { letterSpacing: Number((e.target as HTMLInputElement).value) })}
                            className="w-full"
                          />
                        </label>

                        <label className="flex items-center gap-2 pt-6 text-xs">
                          <input
                            type="checkbox"
                            checked={typography.textShadow}
                            onChange={(e) => void saveSectionTypography(active, { textShadow: e.target.checked })}
                          />
                          Subtle heading text shadow
                        </label>

                        <button
                          type="button"
                          className="btn-outline self-end !py-2 text-[10px]"
                          onClick={() => void saveSectionTypography(active, DEFAULT_SECTION_TYPOGRAPHY)}
                        >
                          Reset section typography
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Title">
                  <input defaultValue={active.title} onBlur={(e) => save({ title: e.target.value })} className="inp" />
                </Field>
                <Field label="Subtitle">
                  <input defaultValue={active.subtitle} onBlur={(e) => save({ subtitle: e.target.value })} className="inp" />
                </Field>
                <Field label="Button text">
                  <input defaultValue={active.buttonText} onBlur={(e) => save({ buttonText: e.target.value })} className="inp" />
                </Field>
                <Field label="Button URL">
                  <input defaultValue={active.buttonUrl} onBlur={(e) => save({ buttonUrl: e.target.value })} className="inp" />
                </Field>
                <Field label="Secondary button text">
                  <input defaultValue={active.button2Text} onBlur={(e) => save({ button2Text: e.target.value })} className="inp" />
                </Field>
                <Field label="Secondary button URL">
                  <input defaultValue={active.button2Url} onBlur={(e) => save({ button2Url: e.target.value })} className="inp" />
                </Field>
                <Field label="Background (CSS color/gradient)">
                  <input defaultValue={active.background} onBlur={(e) => save({ background: e.target.value })} className="inp" placeholder="#f3ece2" />
                </Field>
                <Field label="Text color">
                  <input defaultValue={active.textColor} onBlur={(e) => save({ textColor: e.target.value })} className="inp" placeholder="#3a2b22" />
                </Field>
                <Field label="Text position">
                  <select defaultValue={active.textPosition} onChange={(e) => save({ textPosition: e.target.value })} className="inp">
                    {["left", "center", "right"].map((p) => (<option key={p} value={p}>{p}</option>))}
                  </select>
                </Field>
                <Field label={`Overlay opacity (${active.overlayOpacity}%)`}>
                  <input type="range" min={0} max={90} defaultValue={active.overlayOpacity} onMouseUp={(e) => save({ overlayOpacity: Number((e.target as HTMLInputElement).value) })} className="w-full" />
                </Field>
              </div>

              {active.key === "hero" && (
                <div className="mt-5 space-y-5 border-t border-[var(--svj-border)] pt-5">
                  <div>
                    <h3 className="text-[11px] font-semibold uppercase tracking-widest">Logo & Hero Carousel</h3>
                    <p className="mt-1 text-[10px] text-[var(--svj-muted)]">Upload your real SunVera Jolie logo and build up to 6 rotating hero slides.</p>
                  </div>

                  <div className="border border-[var(--svj-border)] p-3">
                    <span className="label">Brand logo</span>
                    {heroSettings(active).logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={String(heroSettings(active).logoUrl)} alt="Brand logo" className="mt-2 h-20 max-w-[220px] object-contain" />
                    ) : (
                      <p className="mt-2 text-[10px] text-[var(--svj-muted)]">No logo uploaded.</p>
                    )}
                    <label className="mt-3 inline-flex cursor-pointer border border-[var(--svj-border)] px-3 py-2 text-[10px] font-semibold uppercase tracking-wider">
                      Upload logo from computer
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const url = await uploadImage(file, "brand");
                          if (url) await saveHeroSettings(active, { logoUrl: url });
                        }}
                      />
                    </label>
                    <button type="button" onClick={() => openMediaPicker("brand", async (url) => saveHeroSettings(active, { logoUrl: url }))} className="mt-2 border border-[var(--svj-border)] px-3 py-2 text-[10px] font-semibold uppercase tracking-wider">
                      Choose from Media Library
                    </button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Autoplay">
                      <select
                        value={heroSettings(active).autoplay === false ? "off" : "on"}
                        onChange={(e) => void saveHeroSettings(active, { autoplay: e.target.value === "on" })}
                        className="inp"
                      >
                        <option value="on">On</option>
                        <option value="off">Off</option>
                      </select>
                    </Field>
                    <Field label="Change every">
                      <select
                        value={String(Math.round((Number(heroSettings(active).intervalMs) || 4000) / 1000))}
                        onChange={(e) => void saveHeroSettings(active, { intervalMs: Number(e.target.value) * 1000 })}
                        className="inp"
                      >
                        <option value="3">3 seconds</option>
                        <option value="4">4 seconds</option>
                        <option value="5">5 seconds</option>
                        <option value="6">6 seconds</option>
                      </select>
                    </Field>
                    <Field label="Transition">
                      <select
                        value={heroSettings(active).transition === "slide" ? "slide" : "fade"}
                        onChange={(e) => void saveHeroSettings(active, { transition: e.target.value as "fade" | "slide" })}
                        className="inp"
                      >
                        <option value="fade">Smooth fade</option>
                        <option value="slide">Smooth slide</option>
                      </select>
                    </Field>
                  </div>

                  <div className="space-y-3">
                    {heroSlides(active).slice(0, 6).map((slide, i) => (
                      <div key={i} className="border border-[var(--svj-border)] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-[11px] font-semibold uppercase tracking-wider">Slide {i + 1}</h4>
                          {heroSlides(active).length > 1 && (
                            <button
                              type="button"
                              className="text-[10px] text-red-700 underline"
                              onClick={() => {
                                const next = heroSlides(active).filter((_, index) => index !== i);
                                void saveHeroSettings(active, { slides: next });
                              }}
                            >
                              Remove
                            </button>
                          )}
                        </div>

                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <div>
                            <span className="label">Desktop image</span>
                            {slide.image && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={slide.image} alt="" className="mt-1 h-28 w-full object-cover" />
                            )}
                            <label className="mt-2 block cursor-pointer border border-[var(--svj-border)] px-2 py-2 text-center text-[10px]">
                              Upload desktop image
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  const url = await uploadImage(file, "homepage");
                                  if (!url) return;
                                  const next = heroSlides(active).map((item, index) => index === i ? { ...item, image: url } : item);
                                  void saveHeroSettings(active, { slides: next });
                                }}
                              />
                            </label>
                            <button type="button" onClick={() => openMediaPicker("homepage", async (url) => {
                              const next = heroSlides(active).map((item, index) => index === i ? { ...item, image: url } : item);
                              await saveHeroSettings(active, { slides: next });
                            })} className="mt-2 block w-full border border-[var(--svj-border)] px-2 py-2 text-[10px]">
                              Choose from Media Library
                            </button>
                          </div>

                          <div>
                            <span className="label">Mobile image (optional)</span>
                            {slide.mobileImage && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={slide.mobileImage} alt="" className="mt-1 h-28 w-full object-cover" />
                            )}
                            <label className="mt-2 block cursor-pointer border border-[var(--svj-border)] px-2 py-2 text-center text-[10px]">
                              Upload mobile image
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  const url = await uploadImage(file, "homepage");
                                  if (!url) return;
                                  const next = heroSlides(active).map((item, index) => index === i ? { ...item, mobileImage: url } : item);
                                  void saveHeroSettings(active, { slides: next });
                                }}
                              />
                            </label>
                            <button type="button" onClick={() => openMediaPicker("homepage", async (url) => {
                              const next = heroSlides(active).map((item, index) => index === i ? { ...item, mobileImage: url } : item);
                              await saveHeroSettings(active, { slides: next });
                            })} className="mt-2 block w-full border border-[var(--svj-border)] px-2 py-2 text-[10px]">
                              Choose from Media Library
                            </button>
                          </div>

                          <Field label="Headline">
                            <input value={slide.title} onChange={(e) => {
                              const next = heroSlides(active).map((item, index) => index === i ? { ...item, title: e.target.value } : item);
                              setSections((current) => current.map((s) => s.id === active.id ? { ...s, settings: { ...heroSettings(s), slides: next } } : s));
                            }} onBlur={() => void saveHeroSettings(active, { slides: heroSlides(active) })} className="inp" />
                          </Field>
                          <Field label="Description">
                            <input value={slide.subtitle ?? ""} onChange={(e) => {
                              const next = heroSlides(active).map((item, index) => index === i ? { ...item, subtitle: e.target.value } : item);
                              setSections((current) => current.map((s) => s.id === active.id ? { ...s, settings: { ...heroSettings(s), slides: next } } : s));
                            }} onBlur={() => void saveHeroSettings(active, { slides: heroSlides(active) })} className="inp" />
                          </Field>
                          <Field label="Button text">
                            <input value={slide.buttonText ?? ""} onChange={(e) => {
                              const next = heroSlides(active).map((item, index) => index === i ? { ...item, buttonText: e.target.value } : item);
                              setSections((current) => current.map((s) => s.id === active.id ? { ...s, settings: { ...heroSettings(s), slides: next } } : s));
                            }} onBlur={() => void saveHeroSettings(active, { slides: heroSlides(active) })} className="inp" />
                          </Field>
                          <Field label="Button URL">
                            <input value={slide.buttonUrl ?? ""} onChange={(e) => {
                              const next = heroSlides(active).map((item, index) => index === i ? { ...item, buttonUrl: e.target.value } : item);
                              setSections((current) => current.map((s) => s.id === active.id ? { ...s, settings: { ...heroSettings(s), slides: next } } : s));
                            }} onBlur={() => void saveHeroSettings(active, { slides: heroSlides(active) })} className="inp" />
                          </Field>
                        </div>
                      </div>
                    ))}

                    {heroSlides(active).length < 6 && (
                      <button
                        type="button"
                        className="btn-outline !py-2 text-[10px]"
                        onClick={() => {
                          const current = heroSlides(active);
                          const last = current[current.length - 1] ?? heroSlides(active)[0];
                          const next = [...current, { ...last, title: `Slide ${current.length + 1}` }];
                          void saveHeroSettings(active, { slides: next });
                        }}
                      >
                        + Add slide ({heroSlides(active).length}/6)
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                {([
                  ["imageUrl", "Desktop image"],
                  ["imageTabletUrl", "Tablet image"],
                  ["imageMobileUrl", "Mobile image"],
                ] as [keyof Section, string][]).map(([field, label]) => (
                  <div key={String(field)}>
                    <span className="label">{label}</span>
                    <div className="border border-[var(--svj-border)] p-2">
                      {active[field] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={String(active[field])} alt={label} className="h-24 w-full object-cover" />
                      ) : (
                        <p className="py-6 text-center text-[10px] text-[var(--svj-muted)]">No image</p>
                      )}
                      <label className="mt-2 block cursor-pointer border border-[var(--svj-border)] px-2 py-1 text-center text-[10px]">
                        Replace / upload
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const url = await uploadImage(file, active.key === "promo_banner" ? "banners" : "homepage");
                            if (url) await save({ [field]: url } as Partial<Section>);
                          }}
                        />
                      </label>
                      <button type="button" onClick={() => openMediaPicker(active.key === "promo_banner" ? "banners" : "homepage", async (url) => save({ [field]: url } as Partial<Section>))} className="mt-1 w-full border border-[var(--svj-border)] px-2 py-1 text-[10px]">
                        Choose from Media Library
                      </button>
                      <input defaultValue={String(active[field] ?? "")} onBlur={(e) => save({ [field]: e.target.value } as Partial<Section>)} placeholder="or paste image URL" className="inp mt-1 !py-1 text-[10px]" />
                    </div>
                  </div>
                ))}
              </div>

              {["best_sellers", "new_arrivals", "featured"].includes(active.key) && (
                <div className="mt-6 border-t border-[var(--svj-border)] pt-4">
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest">Products</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field label="Mode">
                      <select defaultValue={active.productMode} onChange={(e) => save({ productMode: e.target.value })} className="inp">
                        <option value="auto">Automatic (sales / newest / featured)</option>
                        <option value="manual">Manual selection</option>
                      </select>
                    </Field>
                    <Field label={`Products to show (${active.productCount})`}>
                      <select defaultValue={active.productCount} onChange={(e) => save({ productCount: Number(e.target.value) })} className="inp">
                        {[4, 6, 8, 10, 12].map((n) => (<option key={n} value={n}>{n}</option>))}
                      </select>
                    </Field>
                  </div>
                  {active.productMode === "manual" && (
                    <div className="mt-3 max-h-56 overflow-y-auto border border-[var(--svj-border)] p-2 text-[11px]">
                      {products.map((p) => (
                        <label key={p.id} className="flex items-center gap-2 py-1">
                          <input
                            type="checkbox"
                            checked={active.productIds.includes(p.id)}
                            onChange={(e) => {
                              const ids = e.target.checked
                                ? [...active.productIds, p.id]
                                : active.productIds.filter((x) => x !== p.id);
                              void save({ productIds: ids });
                            }}
                          />
                          {p.name} <span className="text-[var(--svj-muted)]">({p.status})</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {active.key === "new_arrivals" && (
                <div className="mt-6 border-t border-[var(--svj-border)] pt-4">
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest">New Arrivals image rotation</h3>
                  <p className="mt-1 text-[10px] text-[var(--svj-muted)]">Use the product gallery images. The first image remains the default.</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field label="Image behavior">
                      <select
                        value={String(active.settings?.newArrivalsMode ?? "hover-auto")}
                        onChange={(e) => save({ settings: { ...active.settings, newArrivalsMode: e.target.value } })}
                        className="inp"
                      >
                        <option value="static">Static image</option>
                        <option value="hover">Change on hover</option>
                        <option value="auto">Auto rotate</option>
                        <option value="hover-auto">Hover + auto rotate</option>
                      </select>
                    </Field>
                    <Field label="Change every">
                      <select
                        value={String(active.settings?.newArrivalsIntervalMs ?? 3500)}
                        onChange={(e) => save({ settings: { ...active.settings, newArrivalsIntervalMs: Number(e.target.value) } })}
                        className="inp"
                      >
                        {[2000, 3000, 4000, 5000, 6000].map((ms) => <option key={ms} value={ms}>{ms / 1000} seconds</option>)}
                      </select>
                    </Field>
                  </div>
                </div>
              )}

              {active.items.length > 0 && (
                <div className="mt-6 border-t border-[var(--svj-border)] pt-4">
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest">
                    {active.key === "routine" ? "The SunVera Ritual · 4 image cards" : active.key === "collections" ? "Collections · 4 image cards" : "Items / steps / testimonials"}
                  </h3>
                  {(active.key === "routine" || active.key === "collections") && (
                    <p className="mt-1 text-[10px] text-[var(--svj-muted)]">Choose four images, titles and collection links. These cards appear as image-backed collection cards.</p>
                  )}
                  <div className="mt-3 space-y-3">
                    {active.items.slice(0, active.key === "routine" || active.key === "collections" ? 4 : active.items.length).map((it, i) => (
                      <div key={i} className="border border-[var(--svj-border)] p-3">
                        {active.key === "routine" ? (
                          <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
                            <div>
                              <span className="label">Card image</span>
                              {it.image ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={it.image} alt="" className="mt-1 h-28 w-full rounded-lg object-cover" />
                              ) : (
                                <div className="mt-1 flex h-28 items-center justify-center rounded-lg bg-beige text-2xl text-gold">✦</div>
                              )}
                              <label className="mt-2 block cursor-pointer border border-[var(--svj-border)] px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider">
                                Upload image
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    const url = await uploadImage(file, "homepage/ritual");
                                    if (!url) return;
                                    const items = [...active.items];
                                    items[i] = { ...items[i], image: url };
                                    void save({ items });
                                  }}
                                />
                              </label>
                              <button type="button" onClick={() => openMediaPicker("homepage/ritual", async (url) => {
                                const items = [...active.items];
                                items[i] = { ...items[i], image: url };
                                await save({ items });
                              })} className="mt-2 w-full border border-[var(--svj-border)] px-2 py-2 text-[10px]">
                                Choose from Media Library
                              </button>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                              <input defaultValue={it.title} placeholder="Title" className="inp !py-1 text-[11px]" onBlur={(e) => { const items = [...active.items]; items[i] = { ...items[i], title: e.target.value }; void save({ items }); }} />
                              <input defaultValue={it.text ?? ""} placeholder="Subtitle" className="inp !py-1 text-[11px]" onBlur={(e) => { const items = [...active.items]; items[i] = { ...items[i], text: e.target.value }; void save({ items }); }} />
                              <input defaultValue={it.url ?? ""} placeholder="Link URL" className="inp !py-1 text-[11px] sm:col-span-2" onBlur={(e) => { const items = [...active.items]; items[i] = { ...items[i], url: e.target.value }; void save({ items }); }} />
                            </div>
                          </div>
                        ) : (
                          <div className="grid gap-2 sm:grid-cols-4">
                            {active.key === "testimonials" && (
                              <div className="sm:col-span-4 grid gap-2 sm:grid-cols-[120px_1fr]">
                                <div>
                                  <span className="label">Avatar</span>
                                  {it.image ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={it.image} alt="" className="mt-1 h-20 w-20 rounded-full object-cover" />
                                  ) : (
                                    <div className="mt-1 flex h-20 w-20 items-center justify-center rounded-full bg-beige text-xl text-gold">♡</div>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => openMediaPicker("content", async (url) => {
                                      const items = [...active.items];
                                      items[i] = { ...items[i], image: url };
                                      await save({ items });
                                    })}
                                    className="mt-2 border border-[var(--svj-border)] px-2 py-1 text-[9px]"
                                  >
                                    Choose media
                                  </button>
                                  <input
                                    type="number"
                                    min="1"
                                    max="5"
                                    defaultValue={it.rating ?? 5}
                                    className="inp mt-2 !py-1 text-[10px]"
                                    onBlur={(e) => {
                                      const items = [...active.items];
                                      items[i] = { ...items[i], rating: Math.max(1, Math.min(5, Number(e.target.value) || 5)) };
                                      void save({ items });
                                    }}
                                  />
                                  <label className="mt-2 flex items-center gap-1 text-[10px]">
                                    <input
                                      type="checkbox"
                                      defaultChecked={it.verified !== false}
                                      onChange={(e) => {
                                        const items = [...active.items];
                                        items[i] = { ...items[i], verified: e.target.checked };
                                        void save({ items });
                                      }}
                                    />
                                    Verified
                                  </label>
                                </div>
                              </div>
                            )}
                            <input
                            <input defaultValue={it.icon ?? ""} placeholder="Icon" className="inp !py-1 text-[11px]" onBlur={(e) => { const items = [...active.items]; items[i] = { ...items[i], icon: e.target.value }; void save({ items }); }} />
                            <input defaultValue={it.title} placeholder="Title" className="inp !py-1 text-[11px]" onBlur={(e) => { const items = [...active.items]; items[i] = { ...items[i], title: e.target.value }; void save({ items }); }} />
                            <input defaultValue={it.text ?? ""} placeholder="Text" className="inp !py-1 text-[11px]" onBlur={(e) => { const items = [...active.items]; items[i] = { ...items[i], text: e.target.value }; void save({ items }); }} />
                            <input defaultValue={it.url ?? ""} placeholder="URL" className="inp !py-1 text-[11px]" onBlur={(e) => { const items = [...active.items]; items[i] = { ...items[i], url: e.target.value }; void save({ items }); }} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => save({ items: [...active.items, { title: active.key === "routine" ? `Ritual ${Math.min(active.items.length + 1, 4)}` : "New item", url: "/shop" }] })}
                    className="btn-outline mt-2 !py-1.5 text-[10px]"
                  >
                    + Add item
                  </button>
                </div>
              )}
            </section>
          )}

          <section className="bg-white p-5">
            <h2 className="text-[12px] font-semibold uppercase tracking-widest">Trust badges</h2>
            <div className="mt-3 space-y-2">
              {badges.map((b) => (
                <div key={b.id} className="grid gap-2 border border-[var(--svj-border)] p-2 sm:grid-cols-5">
                  <input defaultValue={b.icon} className="inp !py-1 text-[11px]" onBlur={(e) => postBadge({ id: b.id, icon: e.target.value })} />
                  <input defaultValue={b.title} className="inp !py-1 text-[11px]" onBlur={(e) => postBadge({ id: b.id, title: e.target.value })} />
                  <input defaultValue={b.description} className="inp col-span-2 !py-1 text-[11px]" onBlur={(e) => postBadge({ id: b.id, description: e.target.value })} />
                  <div className="flex items-center gap-2 text-[10px]">
                    <label className="flex items-center gap-1">
                      <input type="checkbox" defaultChecked={b.active} onChange={(e) => postBadge({ id: b.id, active: e.target.checked })} /> active
                    </label>
                    <button onClick={async () => { await fetch("/api/admin/cms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "badge-delete", id: b.id }) }); void loadMarketing(); }} className="text-red-700 underline">delete</button>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={async () => {
                await fetch("/api/admin/cms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "badge-save", icon: "✨", title: "New badge", description: "", active: true, sortOrder: badges.length }) });
                void loadMarketing();
              }}
              className="btn-outline mt-2 !py-1.5 text-[10px]"
            >
              + Add badge
            </button>
          </section>

          <section className="bg-white p-5">
            <h2 className="text-[12px] font-semibold uppercase tracking-widest">Banners</h2>
            <div className="mt-3 space-y-3">
              {banners.map((b) => (
                <div key={b.id} className="border border-[var(--svj-border)] p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input defaultValue={b.title} placeholder="Title" className="inp !py-1 text-[11px]" onBlur={(e) => postBanner({ id: b.id, title: e.target.value })} />
                    <input defaultValue={b.subtitle} placeholder="Subtitle" className="inp !py-1 text-[11px]" onBlur={(e) => postBanner({ id: b.id, subtitle: e.target.value })} />
                    <input defaultValue={b.buttonText} placeholder="Button text" className="inp !py-1 text-[11px]" onBlur={(e) => postBanner({ id: b.id, buttonText: e.target.value })} />
                    <input defaultValue={b.buttonUrl} placeholder="Button URL" className="inp !py-1 text-[11px]" onBlur={(e) => postBanner({ id: b.id, buttonUrl: e.target.value })} />
                    <input defaultValue={b.imageDesktop} placeholder="Desktop image URL" className="inp !py-1 text-[11px]" onBlur={(e) => postBanner({ id: b.id, imageDesktop: e.target.value })} />
                    <input defaultValue={b.imageMobile} placeholder="Mobile image URL" className="inp !py-1 text-[11px]" onBlur={(e) => postBanner({ id: b.id, imageMobile: e.target.value })} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px]">
                    <label className="flex items-center gap-1">
                      <input type="checkbox" defaultChecked={b.active} onChange={(e) => postBanner({ id: b.id, active: e.target.checked })} /> active
                    </label>
                    <label className="flex items-center gap-1">
                      Start <input type="date" className="inp !w-auto !py-0.5 text-[10px]" onChange={(e) => postBanner({ id: b.id, startsAt: e.target.value })} />
                    </label>
                    <label className="flex items-center gap-1">
                      End <input type="date" className="inp !w-auto !py-0.5 text-[10px]" onChange={(e) => postBanner({ id: b.id, endsAt: e.target.value })} />
                    </label>
                    <label className="flex cursor-pointer items-center gap-1 border border-[var(--svj-border)] px-2 py-0.5">
                      Upload banner
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const url = await uploadImage(file, "banners");
                          if (url) await postBanner({ id: b.id, imageDesktop: url, imageMobile: url });
                        }}
                      />
                    </label>
                    <button type="button" onClick={() => openMediaPicker("banners", async (url) => postBanner({ id: b.id, imageDesktop: url, imageMobile: url }))} className="border border-[var(--svj-border)] px-2 py-0.5 text-[10px]">
                      Choose from Media Library
                    </button>
                    <button onClick={async () => { await fetch("/api/admin/cms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "banner-delete", id: b.id }) }); void loadMarketing(); }} className="text-red-700 underline">delete</button>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={async () => {
                await fetch("/api/admin/cms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "banner-save", title: "New banner", active: true, sortOrder: banners.length }) });
                void loadMarketing();
              }}
              className="btn-outline mt-2 !py-1.5 text-[10px]"
            >
              + Add banner
            </button>
          </section>

        </div>
      </div>
    </div>
      <MediaPicker
        open={mediaPickerOpen}
        folder={mediaTarget?.folder || "homepage"}
        onClose={() => {
          setMediaPickerOpen(false);
          setMediaTarget(null);
        }}
        onPick={(media: PickedMedia) => {
          const target = mediaTarget;
          setMediaPickerOpen(false);
          setMediaTarget(null);
          if (target) void target.apply(media.url);
        }}
      />
  );

  async function postBadge(body: Record<string, unknown>) {
    await fetch("/api/admin/cms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "badge-save", ...body }),
    });
    void loadMarketing();
  }

  async function postBanner(body: Record<string, unknown>) {
    await fetch("/api/admin/cms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "banner-save", ...body }),
    });
    void loadMarketing();
  }
}
