import Image from "next/image";
import { cn } from "@/lib/utils";

// Approved PORAC-SDSS artwork (public/brand). `tone="auto"` swaps Light/Dark
// with the theme in CSS, so there is no logo flash on load. Use "dark" on
// surfaces that stay dark in both themes (the auth hero panel).
// The subtitle lockup is for formal documents only, never the app shell.
// `lockup` is the app-shell variant: the approved colours and vectors with a
// larger wordmark set beside the pin. `primary` stays for formal and auth use.
const ASSETS = {
  lockup: { light: "/brand/lockup-light.svg", dark: "/brand/lockup-dark.svg", ratio: 1986.8 / 320.33 },
  primary: { light: "/brand/logo-light.svg", dark: "/brand/logo-dark.svg", ratio: 1306.7 / 320.33 },
  symbol: { light: "/brand/symbol-light.svg", dark: "/brand/symbol-dark.svg", ratio: 250.8 / 320.33 },
} as const;

type BrandLogoProps = {
  variant?: keyof typeof ASSETS;
  tone?: "auto" | "light" | "dark";
  /** Rendered height in px; width follows the artwork's own proportions. */
  height?: number;
  className?: string;
  priority?: boolean;
};

export function BrandLogo({ variant = "primary", tone = "auto", height = 32, className, priority }: BrandLogoProps) {
  const { light, dark, ratio } = ASSETS[variant];
  const width = Math.round(height * ratio);
  const common = { width, height, priority, style: { height, width: "auto" } } as const;
  const lightClass = tone === "auto" ? "block dark:hidden" : "block";
  const darkClass = tone === "auto" ? "hidden dark:block" : "block";
  return (
    <span className={cn("inline-flex shrink-0", className)}>
      {tone !== "dark" && <Image {...common} src={light} alt="PORAC-SDSS" className={lightClass} />}
      {tone !== "light" && <Image {...common} src={dark} alt="PORAC-SDSS" className={darkClass} />}
    </span>
  );
}
