import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";

// "Inter Display" is not a real Google Font (verified against next/font/google's
// catalog — only "Inter" and "Inter Tight" exist). Inter's variable font ships a
// real opsz axis (14-32) instead, requested here and paired with
// `font-optical-sizing: auto` in globals.css — the verified substitute for a
// separate display cut, with no unverified font file downloaded or committed.
const interSans = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  axes: ["opsz"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "porac-sdss-nextjs",
  description: "Municipal infrastructure and hazard reporting",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${interSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
