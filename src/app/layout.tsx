import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "APA Transit",
  description: "Registro de movimientos del servicio de Anatomía Patológica.",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "APA Transit" }
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#143b36" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body><a className="skip-link" href="#main">Saltar al contenido</a>{children}</body></html>;
}
