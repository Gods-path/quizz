import type { Metadata, Viewport } from "next";
import { Fredoka, Inter } from "next/font/google";
import "./globals.css";

/**
 * Les polices sont servies par notre propre domaine (next/font les
 * télécharge au moment de la construction) : rien n'est demandé à
 * Google depuis le téléphone de l'apprenant, ce qui aide en 3G.
 */
// Fredoka : ronde et épaisse, c'est la typographie des affiches de quiz.
const fredoka = Fredoka({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
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
  themeColor: "#3aa757",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body className={`${fredoka.variable} ${inter.variable}`}>{children}</body>
    </html>
  );
}
