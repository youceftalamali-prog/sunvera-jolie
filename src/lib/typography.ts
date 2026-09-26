export type FontOption = {
  id: string;
  label: string;
  category: "Luxury Serif" | "Modern Sans" | "Arabic" | "Universal";
  stack: string;
};

export const FONT_OPTIONS: FontOption[] = [
  { id: "playfair", label: "Playfair Display", category: "Luxury Serif", stack: '"Playfair Display", Georgia, serif' },
  { id: "cormorant-garamond", label: "Cormorant Garamond", category: "Luxury Serif", stack: '"Cormorant Garamond", Georgia, serif' },
  { id: "dm-serif-display", label: "DM Serif Display", category: "Luxury Serif", stack: '"DM Serif Display", Georgia, serif' },
  { id: "eb-garamond", label: "EB Garamond", category: "Luxury Serif", stack: '"EB Garamond", Georgia, serif' },
  { id: "libre-baskerville", label: "Libre Baskerville", category: "Luxury Serif", stack: '"Libre Baskerville", Georgia, serif' },
  { id: "lora", label: "Lora", category: "Luxury Serif", stack: 'Lora, Georgia, serif' },
  { id: "cinzel", label: "Cinzel", category: "Luxury Serif", stack: 'Cinzel, Georgia, serif' },
  { id: "prata", label: "Prata", category: "Luxury Serif", stack: 'Prata, Georgia, serif' },
  { id: "bodoni-moda", label: "Bodoni Moda", category: "Luxury Serif", stack: '"Bodoni Moda", Georgia, serif' },
  { id: "manrope", label: "Manrope", category: "Modern Sans", stack: 'Manrope, system-ui, sans-serif' },
  { id: "montserrat", label: "Montserrat", category: "Modern Sans", stack: 'Montserrat, system-ui, sans-serif' },
  { id: "poppins", label: "Poppins", category: "Modern Sans", stack: 'Poppins, system-ui, sans-serif' },
  { id: "raleway", label: "Raleway", category: "Modern Sans", stack: 'Raleway, system-ui, sans-serif' },
  { id: "inter", label: "Inter", category: "Modern Sans", stack: 'Inter, system-ui, sans-serif' },
  { id: "dm-sans", label: "DM Sans", category: "Modern Sans", stack: '"DM Sans", system-ui, sans-serif' },
  { id: "ibm-plex-sans", label: "IBM Plex Sans", category: "Modern Sans", stack: '"IBM Plex Sans", system-ui, sans-serif' },
  { id: "cairo", label: "Cairo", category: "Arabic", stack: 'Cairo, "Noto Sans Arabic", Tahoma, sans-serif' },
  { id: "tajawal", label: "Tajawal", category: "Arabic", stack: 'Tajawal, "Noto Sans Arabic", Tahoma, sans-serif' },
  { id: "noto-sans-arabic", label: "Noto Sans Arabic", category: "Arabic", stack: '"Noto Sans Arabic", Tahoma, sans-serif' },
  { id: "noto-kufi-arabic", label: "Noto Kufi Arabic", category: "Arabic", stack: '"Noto Kufi Arabic", Tahoma, sans-serif' },
  { id: "ibm-plex-sans-arabic", label: "IBM Plex Sans Arabic", category: "Arabic", stack: '"IBM Plex Sans Arabic", Tahoma, sans-serif' },
  { id: "readex-pro", label: "Readex Pro", category: "Arabic", stack: '"Readex Pro", "Noto Sans Arabic", Tahoma, sans-serif' },
  { id: "almarai", label: "Almarai", category: "Arabic", stack: 'Almarai, "Noto Sans Arabic", Tahoma, sans-serif' },
  { id: "amiri", label: "Amiri", category: "Arabic", stack: 'Amiri, "Times New Roman", serif' },
  { id: "noto-serif-arabic", label: "Noto Serif Arabic", category: "Arabic", stack: '"Noto Serif Arabic", "Times New Roman", serif' },
  { id: "scheherazade", label: "Scheherazade New", category: "Arabic", stack: '"Scheherazade New", "Times New Roman", serif' },
  { id: "universal-serif", label: "Georgia / Classic Serif", category: "Universal", stack: 'Georgia, "Times New Roman", serif' },
  { id: "universal-sans", label: "System / Clean Sans", category: "Universal", stack: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
];

export type SectionTypography = {
  headingFont?: string;
  bodyFont?: string;
  buttonFont?: string;
  headingSize?: number;
  bodySize?: number;
  buttonSize?: number;
  headingColor?: string;
  bodyColor?: string;
  buttonColor?: string;
  buttonTextColor?: string;
  headingWeight?: number;
  letterSpacing?: number;
  textShadow?: boolean;
};

export const DEFAULT_SECTION_TYPOGRAPHY: Required<SectionTypography> = {
  headingFont: "playfair",
  bodyFont: "universal-sans",
  buttonFont: "montserrat",
  headingSize: 42,
  bodySize: 15,
  buttonSize: 11,
  headingColor: "#3a2b22",
  bodyColor: "#6b5749",
  buttonColor: "#3a2b22",
  buttonTextColor: "#fdfbf7",
  headingWeight: 500,
  letterSpacing: 0.02,
  textShadow: false,
};

export function getFontStack(id: string | undefined, fallback = DEFAULT_SECTION_TYPOGRAPHY.bodyFont) {
  const option = FONT_OPTIONS.find((font) => font.id === id);
  if (option) return option.stack;
  return FONT_OPTIONS.find((font) => font.id === fallback)?.stack ?? FONT_OPTIONS[0].stack;
}

export function normalizeSectionTypography(value: unknown): Required<SectionTypography> {
  const raw = value && typeof value === "object" ? value as Partial<SectionTypography> : {};
  return {
    ...DEFAULT_SECTION_TYPOGRAPHY,
    ...raw,
    headingSize: Math.min(72, Math.max(20, Number(raw.headingSize ?? DEFAULT_SECTION_TYPOGRAPHY.headingSize) || DEFAULT_SECTION_TYPOGRAPHY.headingSize)),
    bodySize: Math.min(28, Math.max(10, Number(raw.bodySize ?? DEFAULT_SECTION_TYPOGRAPHY.bodySize) || DEFAULT_SECTION_TYPOGRAPHY.bodySize)),
    buttonSize: Math.min(20, Math.max(9, Number(raw.buttonSize ?? DEFAULT_SECTION_TYPOGRAPHY.buttonSize) || DEFAULT_SECTION_TYPOGRAPHY.buttonSize)),
    headingWeight: Math.min(900, Math.max(300, Number(raw.headingWeight ?? DEFAULT_SECTION_TYPOGRAPHY.headingWeight) || DEFAULT_SECTION_TYPOGRAPHY.headingWeight)),
    letterSpacing: Math.min(0.2, Math.max(-0.05, Number(raw.letterSpacing ?? DEFAULT_SECTION_TYPOGRAPHY.letterSpacing) || 0)),
  };
}
