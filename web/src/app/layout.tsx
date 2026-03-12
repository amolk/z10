import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Zero-10",
  description: "Branchable UI evolution for the agent era",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${geistMono.variable} antialiased bg-[var(--ed-bg)] text-[var(--ed-text)]`}
        style={{ fontFamily: "var(--font-inter), -apple-system, system-ui, sans-serif" }}
      >
        {children}
      </body>
    </html>
  );
}
