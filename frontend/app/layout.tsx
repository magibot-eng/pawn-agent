import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pawn Agent",
  description: "ENS-native AI token buyout storefronts on Base Sepolia.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
