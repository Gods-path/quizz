"use client";

import { Pastille } from "./Pastille";

export interface Place {
  rank: number;
  name: string;
  score: number;
}

const HAUTEURS = [170, 120, 90];
const MEDAILLES = ["🥇", "🥈", "🥉"];
const COULEURS = ["#ffc72c", "#9bb3c4", "#e0893c"];

/** Podium animé des trois premiers : 2e à gauche, 1er au centre. */
export function Podium({ places }: { places: Place[] }) {
  const trois = places.slice(0, 3);
  if (trois.length === 0) return null;

  // Ordre d'affichage : 2, 1, 3
  const ordre = [trois[1], trois[0], trois[2]].filter(Boolean);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        gap: "clamp(0.6rem, 2vw, 2rem)",
        flexWrap: "nowrap",
      }}
    >
      {ordre.map((place) => {
        const index = place.rank - 1;
        return (
          <div key={place.name} style={{ textAlign: "center", width: "min(32vw, 200px)" }}>
            <div
              className="anim-rebondit"
              style={{ animationDelay: `${(3 - place.rank) * 0.25}s` }}
            >
              <Pastille nom={place.name} taille={72} anime={false} />
              <div
                className="chiffre"
                style={{ fontSize: "clamp(1.1rem, 2vw, 1.8rem)", marginTop: 4 }}
              >
                {place.score} pts
              </div>
            </div>
            <div
              className="anim-monte"
              style={{
                alignItems: "flex-start",
                // Un aplat et une ombre plate : le style de l'affiche.
                background: COULEURS[index],
                borderRadius: "1rem 1rem 0 0",
                boxShadow: "0 6px 0 rgba(35, 49, 61, 0.15)",
                display: "flex",
                fontSize: "clamp(1.6rem, 3vw, 2.6rem)",
                height: HAUTEURS[index],
                justifyContent: "center",
                marginTop: 10,
                paddingTop: 10,
                animationDelay: `${(3 - place.rank) * 0.25}s`,
              }}
            >
              <span aria-label={`${place.rank}e place`}>{MEDAILLES[index]}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
