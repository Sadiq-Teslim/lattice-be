import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Lattice | Proof-of-life payroll verification SDK",
  description:
    "Lattice plugs into payroll systems to verify staff, produce signed VIQs, and release only eligible salaries through payment infrastructure like Squad.",
  icons: {
    icon: "/lattice-logo-transparent.png",
    shortcut: "/lattice-logo-transparent.png",
    apple: "/lattice-logo-transparent.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={inter.variable}>{children}</body>
    </html>
  );
}
