import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "APA Transit", short_name: "APA Transit",
    description: "Registro de movimientos de Anatomía Patológica.",
    lang: "es", start_url: "/", scope: "/", display: "standalone",
    background_color: "#f1f5f0", theme_color: "#143b36",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }]
  };
}
