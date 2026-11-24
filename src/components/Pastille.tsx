"use client";

const COULEURS = [
  "#ff2e97",
  "#25e5ff",
  "#00e35f",
  "#ffc400",
  "#b14bff",
  "#ff6a3d",
  "#ff2d55",
  "#4d7cff",
];

/** Une couleur stable par nom : le même apprenant garde sa couleur. */
function couleurDe(nom: string): string {
  let total = 0;
  for (const caractere of nom) total += caractere.codePointAt(0) ?? 0;
  return COULEURS[total % COULEURS.length];
}

/** « Marie Noube » -> « MN », « Paul » -> « PA ». */
export function initialesDe(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return "?";
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase();
  return (mots[0][0] + mots[1][0]).toUpperCase();
}

export function Pastille({
  nom,
  taille = 64,
  surRetrait,
  anime = true,
}: {
  nom: string;
  taille?: number;
  /** Si fourni, une petite croix permet de retirer le joueur. */
  surRetrait?: () => void;
  anime?: boolean;
}) {
  return (
    <div
      className={anime ? "anim-rebondit" : undefined}
      style={{ position: "relative", textAlign: "center", width: taille + 16 }}
    >
      <div
        className="titre"
        style={{
          alignItems: "center",
          // Pas de color-mix() dans un style en ligne : impossible d'y
          // mettre un repli pour les vieux navigateurs. Un voile blanc et
          // un voile noir par-dessus la couleur donnent le même relief.
          background: `radial-gradient(circle at 30% 25%, rgba(255,255,255,0.45), rgba(0,0,0,0.35)), ${couleurDe(nom)}`,
          border: "2px solid rgba(255, 255, 255, 0.6)",
          borderRadius: "50%",
          color: "#fff",
          display: "flex",
          fontSize: taille * 0.34,
          height: taille,
          justifyContent: "center",
          margin: "0 auto",
          width: taille,
          boxShadow: `0 0 18px ${couleurDe(nom)}, inset 0 1px 0 rgb(255 255 255 / 0.4)`,
          textShadow: "0 1px 4px rgb(0 0 0 / 0.6)",
        }}
        aria-hidden
      >
        {initialesDe(nom)}
      </div>
      <div
        style={{
          fontSize: "0.78rem",
          marginTop: 6,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={nom}
      >
        {nom}
      </div>
      {surRetrait && (
        <button
          type="button"
          onClick={surRetrait}
          aria-label={`Retirer ${nom}`}
          title={`Retirer ${nom}`}
          style={{
            position: "absolute",
            top: -4,
            right: 0,
            width: 26,
            height: 26,
            borderRadius: "50%",
            border: "none",
            background: "var(--color-echec)",
            color: "#fff",
            cursor: "pointer",
            fontSize: 14,
            lineHeight: "26px",
            padding: 0,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
