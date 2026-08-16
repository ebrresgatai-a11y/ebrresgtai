import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EBR Gestão",
  description: "Gestão da Escola Bíblica Resgatai",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "EBR Gestão"
  },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-180.png" }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1E3A5F"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
