import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WhatsApp Platform",
  description: "Plataforma de atención al cliente vía WhatsApp",
  icons: {
    icon: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="font-sans">{children}</body>
    </html>
  );
}
