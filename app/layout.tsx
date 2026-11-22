import type { Metadata } from "next";
import { Inter, Geist_Mono, Montserrat } from "next/font/google";
import { themeInitScript } from "@/lib/theme";
import "./globals.css";

// Inter's variable font ships a real opsz axis (14-32); paired with
// `font-optical-sizing: auto` in globals.css it stands in for a display cut.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
});

// Brand headings (Figma brand guide: Montserrat Bold/ExtraBold). Variable font,
// one file, so heading weights stay flexible without extra requests.
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  // Absolute base for the og:image URL (app/opengraph-image.png). Set NEXT_PUBLIC_SITE_URL
  // once the production domain is decided; hosting is still open (docs/deployment-readiness.md).
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "PORAC-SDSS", template: "%s | PORAC-SDSS" },
  description: "Municipal infrastructure and hazard reporting",
  openGraph: {
    title: "PORAC-SDSS",
    description: "Municipal infrastructure and hazard reporting",
    siteName: "PORAC-SDSS",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "PORAC-SDSS", description: "Municipal infrastructure and hazard reporting" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${montserrat.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
