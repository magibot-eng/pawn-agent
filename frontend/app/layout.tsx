import type { Metadata } from "next";
import { Noto_Serif } from "next/font/google";
import AppProviders from '../components/AppProviders';
import "./globals.css";

const notoSerif = Noto_Serif({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-maritime-serif",
});

export const metadata: Metadata = {
  title: "Pawn Agent",
  description: "ENS-native AI token buyout storefronts on Base Sepolia.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={notoSerif.variable}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
