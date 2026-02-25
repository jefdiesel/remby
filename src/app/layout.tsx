import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NYC Property Intel - Free NYC Real Estate Intelligence",
  description: "Search any NYC property for sales history, violations, permits, neighborhood comparables, and market signals. Powered by free NYC Open Data.",
  keywords: ["NYC", "real estate", "property search", "ACRIS", "HPD", "DOB", "violations", "sales history"],
  openGraph: {
    title: "NYC Property Intel",
    description: "Free NYC real estate intelligence powered by open data",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
