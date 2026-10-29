import type { Metadata, Viewport } from "next";
import { Space_Grotesk } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LocaleProvider } from "@/lib/i18n-context";
import { ConnectionStatus } from "@/components/shared/connection-status";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-space-grotesk",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1a1a" },
  ],
};

export const metadata: Metadata = {
  title: "Học Cùng — Giáo viên AI & Định hướng tương lai",
  description: "Học từ căn bản đến nâng cao, luyện quiz, ôn flashcard và xây dựng lịch học cùng giáo viên AI. Học liệu được giảng viên kiểm duyệt.",
  applicationName: "Học Cùng",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Học Cùng",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" suppressHydrationWarning className={spaceGrotesk.variable}>
      <body className="antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-lg focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-lg focus:ring-2 focus:ring-ring"
        >
          Skip to content
        </a>
        <ConnectionStatus />
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <LocaleProvider>
            <TooltipProvider>
              <main id="main-content">
                {children}
              </main>
            </TooltipProvider>
            <Toaster />
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
