"use client";

import { useEffect, useState } from "react";

export interface PlaceClassement {
  id: string;
  rank: number;
  name: string;
  score: number;
}

/**
 * Le classement en plein écran, entre deux questions.
 *
 * Les barres partent de zéro et poussent vers la droite, les unes après
 * les autres : toute la salle voit les positions se dessiner avant de
 * passer à la question suivante.
 *
 * (Les animations sont coupées automatiquement si la personne a demandé
 * à réduire les mouvements — la règle est dans globals.css.)
 */
export function ClassementPlein({
  joueurs,
  titre = "Classement",
  sousTitre,
  maximum = 8,
  moiId,
}: {
  joueurs: PlaceClassement[];
  titre?: string;
  sousTitre?: string;
  maximum?: number;
  /** Sur le téléphone : la ligne de l'apprenant, mise en évidence. */
  moiId?: string;
}) {
  const [anime, setAnime] = useState(false);

  // On laisse le navigateur peindre les barres à zéro, PUIS on déclenche
  // la transition : sans ce décalage, elles apparaîtraient déjà remplies.
  useEffect(() => {
    const depart = setTimeout(() => setAnime(true), 120);
    return () => clearTimeout(depart);
  }, []);

  const montres = joueurs.slice(0, maximum);
  const meilleur = Math.max(1, ...montres.map((joueur) => joueur.score));

  return (
    <div className="classement-plein">
      <h1
        style={{
          color: "#fff",
          fontSize: "clamp(1.6rem, 4vw, 3rem)",
          margin: "0 0 0.2rem",
          textAlign: "center",
        }}
      >
        {titre}
      </h1>
      {sousTitre && (
        <p
          style={{
            color: "rgba(255, 255, 255, 0.85)",
            fontSize: "clamp(0.9rem, 1.6vw, 1.3rem)",
            margin: "0 0 clamp(1rem, 3vh, 2rem)",
            textAlign: "center",
          }}
        >
          {sousTitre}
        </p>
      )}

      {montres.length === 0 && (
        <p style={{ color: "#fff", fontSize: "1.2rem" }}>Aucun joueur.</p>
      )}

      {montres.map((joueur, position) => {
        const moi = moiId !== undefined && joueur.id === moiId;
        return (
          <div
            className="ligne anim-glisse"
            key={joueur.id}
            style={{ animationDelay: `${position * 0.07}s` }}
          >
            <span className="rang chiffre">{joueur.rank}</span>
            <div className="barre">
              <span
                style={{
                  // Une largeur minimale pour que le nom reste lisible même
                  // avec zéro point.
                  width: anime
                    ? `${Math.max(16, (joueur.score / meilleur) * 100)}%`
                    : "0%",
                  transitionDelay: `${position * 0.1}s`,
                  ...(moi
                    ? { background: "var(--color-jaune)", color: "#4a3600" }
                    : null),
                }}
              >
                {joueur.name}
                {moi && " (vous)"}
              </span>
            </div>
            <span className="points chiffre">{joueur.score}</span>
          </div>
        );
      })}

      {joueurs.length > montres.length && (
        <p
          style={{
            color: "rgba(255, 255, 255, 0.85)",
            fontSize: "clamp(0.85rem, 1.4vw, 1.1rem)",
            marginTop: "0.8rem",
          }}
        >
          … et {joueurs.length - montres.length} autre
          {joueurs.length - montres.length > 1 ? "s" : ""} apprenant
          {joueurs.length - montres.length > 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
