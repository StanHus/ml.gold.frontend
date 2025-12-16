import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gold AI - Market Intelligence",
  description: "Advanced gold market analysis, pattern detection, and news quantification",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">{children}</body>
    </html>
  );
}
