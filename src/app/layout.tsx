import type { Metadata, Viewport } from "next";
import { Roboto, Roboto_Mono } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";

import "./globals.css";

// Roboto is the font used across agamwaterindustries.com.
const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    template: `%s | ${brand.shortName}`,
    default: `${brand.appName} · ${brand.company}`,
  },
  description: `${brand.tagline} for ${brand.company}.`,
  applicationName: brand.appName,
  appleWebApp: { title: brand.shortName, capable: true },
};

export const viewport: Viewport = {
  colorScheme: "light",
  viewportFit: "cover",
  themeColor: brand.colors.navy,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn("h-full antialiased", roboto.variable, robotoMono.variable)}
    >
      <body className="flex min-h-full flex-col font-sans">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
