"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GardeFormateur } from "@/components/GardeFormateur";
import { audio } from "@/lib/audio/engine";
import { phraseAuHasard, pourLaVoix } from "@/lib/audio/phrases";

/**
 * Page de test du son, à ouvrir avant un cours.
 *
 * Les navigateurs interdisent tout son tant que l'utilisateur n'a pas
 * touché l'écran : le premier bouton sert justement à débloquer.
 */
export default function PageSon() {
  return (
    <GardeFormateur>
      <TestDuSon />
    </GardeFormateur>
  );
}

function TestDuSon() {
  const [diag, setDiag] = useState<ReturnType<
    ReturnType<typeof audio>["diagnostic"]
  > | null>(null);
  const [dernier, setDernier] = useState<string | null>(null);

  const rafraichir = () => setDiag(audio().diagnostic());

  useEffect(() => {
    rafraichir();
    const horloge = setInterval(rafraichir, 1500);
    return () => clearInterval(horloge);
  }, []);

  function essayer(nom: string, action: () => void) {
    audio().debloquer();
    action();
    setDernier(nom);
    rafraichir();
  }

  const essais: { nom: string; aide: string; action: () => void }[] = [
    {
      nom: "Musique de la salle d'attente",
      aide: "Calme et joyeuse, en boucle, à faible volume.",
      action: () => audio().definirAmbiance("attente"),
    },
    {
      nom: "Musique pendant une question",
      aide: "Plus rythmée, avec le tic-tac.",
      action: () => {
        audio().definirTempsRestant(30);
        audio().definirAmbiance("question");
      },
    },
    {
      nom: "Tic-tac des 10 dernières secondes",
      aide: "Le tic-tac s'accélère quand le temps presse.",
      action: () => {
        audio().definirAmbiance("question");
        audio().definirTempsRestant(4);
      },
    },
    {
      nom: "Couper la musique",
      aide: "Remet le silence.",
      action: () => audio().definirAmbiance("silence"),
    },
    {
      nom: "🎉 Bruitage de victoire",
      aide: "Joué quand un apprenant a juste.",
      action: () => audio().bruitageVictoire(),
    },
    {
      nom: "😂 Bruitage de rire",
      aide: "Joué quand un apprenant s'est trompé.",
      action: () => audio().bruitageRire(),
    },
    {
      nom: "🐢 Bruitage « trop lent »",
      aide: "Joué quand personne n'a répondu à temps.",
      action: () => audio().bruitageTortue(),
    },
    {
      nom: "🏆 Fanfare du podium",
      aide: "Jouée à la fin de la partie.",
      action: () => audio().fanfare(),
    },
    {
      nom: "Voix : réussite",
      aide: "Ton enjoué, débit un peu rapide.",
      action: () => {
        const phrase = phraseAuHasard("reussite");
        audio().bruitageVictoire();
        audio().parler(pourLaVoix(phrase), "enjoue", 250);
      },
    },
    {
      nom: "Voix : échec moqueur",
      aide: "Le rire d'abord, la phrase moqueuse juste après.",
      action: () => {
        const phrase = phraseAuHasard("echecMoqueur");
        audio().bruitageRire();
        audio().parler(pourLaVoix(phrase), "moqueur", 850);
      },
    },
  ];

  return (
    <main style={{ margin: "0 auto", maxWidth: 860, padding: "1.5rem 1rem 4rem" }}>
      <header style={{ marginBottom: "1.5rem" }}>
        <Link href="/formateur" style={{ color: "var(--color-encre-doux)", fontSize: "0.9rem" }}>
          ← Retour à la bibliothèque
        </Link>
        <h1 style={{ fontSize: "2rem", margin: "0.5rem 0 0" }}>Tester le son</h1>
        <p style={{ color: "var(--color-encre-doux)", margin: "0.3rem 0 0" }}>
          Montez le volume de l'appareil, puis appuyez sur les boutons.
          Faites-le aussi depuis un téléphone, c'est là que ça compte.
        </p>
      </header>

      <section className="carte" style={{ marginBottom: "1.2rem" }}>
        <h2 style={{ fontSize: "1.1rem", marginTop: 0 }}>État</h2>
        <ul style={{ margin: 0, paddingLeft: "1.2rem", lineHeight: 1.9 }}>
          <li>
            Moteur audio :{" "}
            <strong>
              {diag?.contexte ? `créé (${diag.etat})` : "pas encore créé"}
            </strong>
            {diag?.etat === "suspended" && " — touchez l'écran pour le réveiller"}
          </li>
          <li>
            Voix française :{" "}
            <strong>{diag?.voix ?? "aucune trouvée"}</strong>
            {diag && diag.voixDisponibles > 0 && ` — ${diag.voixDisponibles} disponible(s)`}
          </li>
          {diag && !diag.voix && (
            <li style={{ color: "#ffc9c0" }}>
              Sans voix française installée, les phrases s'affichent et les
              bruitages jouent, mais rien n'est prononcé. C'est prévu, et
              l'application fonctionne quand même.
            </li>
          )}
        </ul>
        {dernier && (
          <p style={{ color: "var(--color-encre-doux)", marginBottom: 0 }}>
            Dernier essai : <strong>{dernier}</strong>
          </p>
        )}
      </section>

      <div style={{ display: "grid", gap: "0.7rem" }}>
        {essais.map((essai) => (
          <button
            key={essai.nom}
            type="button"
            className="bouton-secondaire"
            style={{ textAlign: "left", padding: "0.9rem 1.1rem" }}
            onClick={() => essayer(essai.nom, essai.action)}
          >
            <span style={{ display: "block", fontWeight: 600 }}>{essai.nom}</span>
            <span
              style={{
                color: "var(--color-encre-doux)",
                display: "block",
                fontSize: "0.85rem",
              }}
            >
              {essai.aide}
            </span>
          </button>
        ))}
      </div>
    </main>
  );
}
