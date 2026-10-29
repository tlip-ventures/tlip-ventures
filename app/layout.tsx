import type { Metadata, Viewport } from "next";
import { Instrument_Sans, Instrument_Serif } from "next/font/google";
import localFont from "next/font/local";
import { Suspense } from "react";
import { NavigationProgress } from "@/components/ui/navigation-progress";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

// Text font for everything except the wordmark and display headlines.
const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
});

// Wordmark, banner headlines and the "How ordering works" panel only.
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

// Only the cedi sign ₵, which the Instrument fonts lack (see app/fonts/README.md).
// No automatic fallback: this font comes first in the stack, so a fallback
// listed with it would replace Instrument Sans for every other character.
const cediSign = localFont({
  src: "./fonts/cedi-sign.woff2",
  variable: "--font-cedi",
  weight: "100 900",
  display: "swap",
  adjustFontFallback: false,
});

const description =
  "Blenders, kettles, cookware, storage, laundry and more for homes in Ghana. Browse online and order on WhatsApp.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Tlip Ventures — Home & Kitchen Goods in Ghana",
    template: "%s | Tlip Ventures",
  },
  description,
  applicationName: "Tlip Ventures",
  openGraph: {
    type: "website",
    siteName: "Tlip Ventures",
    locale: "en_GH",
    title: "Tlip Ventures — Home & Kitchen Goods in Ghana",
    description,
  },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0f6b43",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GH" className={`${instrumentSans.variable} ${instrumentSerif.variable} ${cediSign.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {/* useSearchParams needs a Suspense boundary. */}
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
