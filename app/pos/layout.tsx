import type { Metadata } from "next";
import { Gloock } from "next/font/google";

// Page titles and big money figures in the Stock & POS app (design/pos/).
// Only this part of the site loads it.
const gloock = Gloock({
  variable: "--font-gloock",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Stock and sales", template: "%s | Tlip Ventures stock" },
  robots: { index: false, follow: false },
};

export default function PosRootLayout({ children }: LayoutProps<"/pos">) {
  return <div className={`pos ${gloock.variable} flex min-h-screen flex-1 flex-col bg-pos-paper text-pos-ink`}>{children}</div>;
}
