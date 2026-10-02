import type { Metadata } from "next";
import "./globals.css";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import ScrollToTop from "@/components/ScrollToTop";
import SiteDocumentTitle from "@/components/SiteDocumentTitle";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://renewableenergy2027.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Conference",
  description: "A global forum for renewable energy innovation and collaboration",
  icons: {
    icon: "/favicon.ico",
  },
  alternates: {
    canonical: "/",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans">
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <AuthProvider>
            <SiteDocumentTitle />
            <ScrollToTop />
            {children}
          </AuthProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
