"use client";

import type { Letter } from "@/lib/types";

const CLASSES: Record<Letter, string> = {
  A: "rep-a",
  B: "rep-b",
  C: "rep-c",
  D: "rep-d",
};

/**
 * Un bouton de réponse. Le texte passe par le rendu React, donc il est
 * échappé : même une question contenant du HTML s'affiche comme du texte.
 */
export function BoutonReponse({
  letter,
  text,
  onClick,
  choisi,
  estime,
  desactive,
  marque,
}: {
  letter: Letter;
  text: string;
  onClick?: () => void;
  /** null = pas de sélection en cours ; true/false = choisi ou non. */
  choisi?: boolean | null;
  /** Affiche une coche ou une croix à la correction. */
  estime?: "bonne" | "mauvaise" | null;
  desactive?: boolean;
  /** Petit texte à droite, par exemple le nombre de réponses. */
  marque?: string;
}) {
  return (
    <button
      type="button"
      className={`bouton-reponse ${CLASSES[letter]}`}
      onClick={onClick}
      disabled={desactive || !onClick}
      data-choisi={choisi === false ? "non" : "oui"}
      style={
        estime === "bonne"
          ? { outline: "4px solid var(--color-succes)", outlineOffset: 3 }
          : estime === "mauvaise"
            ? { filter: "saturate(0.3) brightness(0.55)" }
            : undefined
      }
    >
      <span className="lettre" aria-hidden>
        {letter}
      </span>
      <span style={{ flex: 1 }}>{text}</span>
      {estime === "bonne" && <span aria-label="bonne réponse">✓</span>}
      {marque && (
        <span className="titre" style={{ opacity: 0.9 }}>
          {marque}
        </span>
      )}
    </button>
  );
}
