import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "AICTE Approval Operations Intelligence — SIH26262 Prototype",
    template: "%s | AICTE Ops Intelligence (Prototype)",
  },
  description:
    "Independent Smart India Hackathon prototype: workflow automation, compliance monitoring and alert management for technical-education approval operations. Not affiliated with or endorsed by AICTE.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
