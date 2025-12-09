import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gold AI",
  description: "Gold market analysis, training, and testing",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased bg-[#0b0f19] text-slate-100">{children}</body>
    </html>
  );
}
