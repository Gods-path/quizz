import type { Metadata, Viewport } from "next";
import { Inter, Orbitron } from "next/font/google";
import "./globals.css";

/**
 * Les polices sont servies par notre propre domaine (next/font les
 * télécharge au moment de la construction) : rien n'est demandé à
 * Google depuis le téléphone de l'apprenant, ce qui aide en 3G.
 */
// Orbitron pour tout ce qui doit claquer : scores, chronos, code de partie.
// (Le style « arcade néon » demandé remplace l'ancienne police Fredoka.)
const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["500", "700", "900"],
  variable: "--police-titre",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--police-texte",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Quiz en direct",
  description:
    "Quiz en direct pour la classe : le formateur projette, les apprenants jouent sur leur téléphone.",
};

export const viewport: Viewport = {
  themeColor: "#241228",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body className={`${orbitron.variable} ${inter.variable}`}>{children}</body>
    </html>
  );
}
