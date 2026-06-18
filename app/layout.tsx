import type { Metadata } from "next";
import { Geist } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Bebas Neue Pro — tall, narrow caps. Drives the spinning names reel:
// legible at speed, settles cleanly when the draw lands.
const namesFont = localFont({
  src: "../public/fonts/Names Font/Fontspring-DEMO-bebasneuepro-book.otf",
  variable: "--font-names",
  display: "swap",
});

// Newake — ultra-bold chunky display caps. Reserved for the "WIN BIG" payoff:
// the winner reveal and the big broadcast headings; Geist handles UI/body.
const winBigFont = localFont({
  src: "../public/fonts/WIN BIG Font/NewakeFont-Demo.otf",
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SIWA Spinner",
  description: "Live winner reveal displays for Solomon Water.",
  // app/favicon.ico covers the base icon; these add the PNG sizes, the iOS
  // home-screen icon, and the web manifest (see public/favicon/).
  icons: {
    icon: [
      { url: "/favicon/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon/favicon-16x16.png", type: "image/png", sizes: "16x16" },
    ],
    apple: "/favicon/apple-touch-icon.png",
  },
  manifest: "/favicon/site.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${namesFont.variable} ${winBigFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
