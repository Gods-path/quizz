"use client";

/**
 * L'anneau de compte à rebours. Il passe à l'orange à 10 secondes et au
 * rouge à 5 secondes, avec un léger battement : visible du fond de la salle.
 */
export function Chrono({
  secondesRestantes,
  dureeTotale,
  taille = 120,
}: {
  secondesRestantes: number;
  dureeTotale: number;
  taille?: number;
}) {
  const secondes = Math.max(0, Math.ceil(secondesRestantes));
  const fraction =
    dureeTotale > 0 ? Math.max(0, Math.min(1, secondesRestantes / dureeTotale)) : 0;

  const rayon = taille / 2 - 8;
  const circonference = 2 * Math.PI * rayon;
  const couleur =
    secondes <= 5
      ? "var(--color-reponse-a)"
      : secondes <= 10
        ? "var(--color-reponse-c)"
        : "var(--color-cyan)";

  return (
    <div
      className={secondes <= 5 && secondes > 0 ? "anim-pulse" : undefined}
      style={{ width: taille, height: taille, position: "relative" }}
      role="timer"
      aria-live="off"
      aria-label={`${secondes} secondes restantes`}
    >
      <svg width={taille} height={taille} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={taille / 2}
          cy={taille / 2}
          r={rayon}
          fill="none"
          stroke="rgba(255,255,255,0.14)"
          strokeWidth={8}
        />
        <circle
          cx={taille / 2}
          cy={taille / 2}
          r={rayon}
          fill="none"
          stroke={couleur}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={circonference}
          strokeDashoffset={circonference * (1 - fraction)}
          style={{
            filter: `drop-shadow(0 0 7px ${couleur})`,
            transition: "stroke-dashoffset 0.25s linear, stroke 0.3s ease",
          }}
        />
      </svg>
      <div
        className="titre"
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: taille * 0.34,
          color: couleur,
          textShadow: `0 0 12px ${couleur}`,
        }}
      >
        {secondes}
      </div>
    </div>
  );
}
