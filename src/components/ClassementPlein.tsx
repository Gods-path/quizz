"use client";

import { useEffect, useState, type CSSProperties } from "react";

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
 * TOUT LE MONDE y figure, même le dernier. Quand la classe est nombreuse,
 * les lignes se resserrent puis se répartissent en deux ou trois colonnes,
 * pour que personne ne tombe hors de l'écran.
 *
 * (Les animations sont coupées automatiquement si la personne a demandé
 * à réduire les mouvements — la règle est dans globals.css.)
 */
export function ClassementPlein({
  joueurs,
  titre = "Classement",
  sousTitre,
  maximum,
  moiId,
  espaceBas = false,
}: {
  joueurs: PlaceClassement[];
  titre?: string;
  sousTitre?: string;
  /** Par défaut : aucune limite, tout le monde est affiché. */
  maximum?: number;
  /** Sur le téléphone : la ligne de l'apprenant, mise en évidence. */
  moiId?: string;
  /** Réserve la place de la barre de boutons du formateur, qui est
   *  en position fixe et masquerait sinon les dernières lignes. */
  espaceBas?: boolean;
}) {
  const [anime, setAnime] = useState(false);

  // On laisse le navigateur peindre les barres à zéro, PUIS on déclenche
  // la transition : sans ce décalage, elles apparaîtraient déjà remplies.
  useEffect(() => {
    const depart = setTimeout(() => setAnime(true), 120);
    return () => clearTimeout(depart);
  }, []);

  const montres =
    maximum === undefined ? joueurs : joueurs.slice(0, Math.max(0, maximum));
  const meilleur = Math.max(1, ...montres.map((joueur) => joueur.score));

  // Combien de colonnes, et quelle hauteur de ligne ? Tout dépend du
  // nombre d'apprenants : à 100, une seule colonne ne tiendrait pas.
  const nombre = montres.length;
  const colonnes = nombre > 72 ? 4 : nombre > 48 ? 3 : nombre > 24 ? 2 : 1;
  const parColonne = Math.ceil(nombre / colonnes) || 1;

  // La hauteur d'une ligne se déduit de la HAUTEUR DE L'ÉCRAN divisée par
  // le nombre de lignes d'une colonne : c'est ce qui garantit que tout
  // tient sans défiler, que l'on soit 5 ou 100. Sur un écran projeté,
  // faire défiler pour voir le dernier n'aurait aucun sens.
  // 56 vh : ce qui reste une fois le titre, le sous-titre, les marges et
  // la barre de boutons déduits. Mesuré, pas estimé.
  const hauteurVh = Math.max(1.3, Math.min(5.4, (espaceBas ? 48 : 56) / parColonne));
  const hauteurLigne = `min(3.4rem, ${hauteurVh.toFixed(2)}vh)`;
  const tailleTexte = `clamp(0.6rem, ${(hauteurVh * 0.45).toFixed(2)}vh, 1.5rem)`;

  const style = {
    "--hauteur-ligne": hauteurLigne,
    "--taille-texte": tailleTexte,
    "--colonnes": String(colonnes),
    "--par-colonne": String(parColonne),
    ...(espaceBas ? { paddingBottom: "clamp(4.5rem, 11vh, 6.5rem)" } : null),
  } as CSSProperties;

  return (
    <div className="classement-plein" style={style}>
      <h1
        style={{
          color: "#fff",
          // L'en-tête se fait discret quand il y a beaucoup de monde :
          // chaque pixel pris au titre est un pixel rendu aux apprenants.
          fontSize: nombre > 18 ? "clamp(1.1rem, 2.4vw, 1.8rem)" : "clamp(1.4rem, 3.5vw, 2.8rem)",
          margin: "0 0 0.15rem",
          textAlign: "center",
        }}
      >
        {titre}
      </h1>
      {sousTitre && (
        <p
          style={{
            color: "rgba(255, 255, 255, 0.85)",
            fontSize: nombre > 18 ? "clamp(0.7rem, 1.2vw, 0.95rem)" : "clamp(0.85rem, 1.5vw, 1.2rem)",
            margin: `0 0 ${nombre > 18 ? "clamp(0.3rem, 1.2vh, 0.7rem)" : "clamp(0.6rem, 2.5vh, 1.6rem)"}`,
            textAlign: "center",
          }}
        >
          {sousTitre}
        </p>
      )}

      {nombre === 0 ? (
        <p style={{ color: "#fff", fontSize: "1.2rem" }}>Aucun joueur.</p>
      ) : (
        <div className="lignes">
          {montres.map((joueur, position) => {
            const moi = moiId !== undefined && joueur.id === moiId;
            // Le décalage de l'animation est plafonné : avec 100 lignes,
            // attendre 100 × 0,07 s serait interminable.
            const retard = Math.min(position * 0.06, 1.2);
            return (
              <div
                className="ligne anim-glisse"
                key={joueur.id}
                style={{ animationDelay: `${retard}s` }}
              >
                <span className="rang chiffre">{joueur.rank}</span>
                <div className="barre">
                  <span
                    style={{
                      // Une largeur minimale pour que le nom reste lisible
                      // même avec zéro point.
                      width: anime
                        ? `${Math.max(16, (joueur.score / meilleur) * 100)}%`
                        : "0%",
                      transitionDelay: `${retard}s`,
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
        </div>
      )}

      {joueurs.length > nombre && (
        <p
          style={{
            color: "rgba(255, 255, 255, 0.85)",
            fontSize: "clamp(0.85rem, 1.4vw, 1.1rem)",
            marginTop: "0.8rem",
          }}
        >
          … et {joueurs.length - nombre} autre
          {joueurs.length - nombre > 1 ? "s" : ""} apprenant
          {joueurs.length - nombre > 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
