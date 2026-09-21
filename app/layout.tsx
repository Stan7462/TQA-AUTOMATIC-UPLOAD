import type { Metadata, Viewport } from "next";
import "./globals.css";
import PhotoLightbox from "./photo-lightbox";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "TQA Automatic Upload",
  description: "Review extraction results and approve technician QC submissions with an account screenshot and live photos.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "TQA Upload",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}<PhotoLightbox /></body>
    </html>
  );
}
