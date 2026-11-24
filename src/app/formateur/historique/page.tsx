"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { GardeFormateur } from "@/components/GardeFormateur";

interface PartiePassee {
  id: string;
  code: string;
  quiz_title: string;
  question_count: number;
  phase: string;
  player_count: number;
  pass_threshold: number;
  created_at: string;
  ended_at: string | null;
}

const PHASES: Record<string, string> = {
  lobby: "Salle d'attente",
  question: "En cours",
  reveal: "En cours",
  finished: "Terminée",
};

export default function PageHistorique() {
  return (
    <GardeFormateur>
      <Historique />
    </GardeFormateur>
  );
}

function Historique() {
  const [parties, setParties] = useState<PartiePassee[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const reponse = await fetch("/api/game");
      const donnees = await reponse.json();
      if (!reponse.ok) {
        setErreur(donnees.erreur ?? "Impossible de charger l'historique.");
        return;
      }
      setParties(donnees.parties);
    } catch {
      setErreur("Pas de réseau.");
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function supprimer(partie: PartiePassee) {
    const sur = window.confirm(
      `Supprimer la partie ${partie.code} du ${new Date(partie.created_at).toLocaleDateString("fr-FR")} ?\n` +
        `Les résultats de ses ${partie.player_count} joueur(s) seront perdus.\n` +
        `Le quiz « ${partie.quiz_title} » n'est pas touché.`,
    );
    if (!sur) return;
    const reponse = await fetch(`/api/game/${partie.id}`, { method: "DELETE" });
    if (!reponse.ok) {
      const donnees = await reponse.json().catch(() => ({}));
      setErreur(donnees.erreur ?? "Suppression impossible.");
      return;
    }
    setErreur(null);
    await charger();
  }

  return (
    <main style={{ margin: "0 auto", maxWidth: 1000, padding: "1.5rem 1rem 4rem" }}>
      <header style={{ marginBottom: "1.5rem" }}>
        <Link href="/formateur" style={{ color: "var(--color-creme-doux)", fontSize: "0.9rem" }}>
          ← Retour à la bibliothèque
        </Link>
        <h1 style={{ fontSize: "2rem", margin: "0.5rem 0 0" }}>Historique des parties</h1>
      </header>

      {erreur && (
        <p className="erreur" role="alert">
          {erreur}
        </p>
      )}

      {parties === null && !erreur && <p>Chargement…</p>}

      {parties !== null && parties.length === 0 && (
        <div className="carte" style={{ textAlign: "center" }}>
          <p style={{ margin: 0 }}>Aucune partie jouée pour le moment.</p>
        </div>
      )}

      <div style={{ display: "grid", gap: "0.8rem" }}>
        {(parties ?? []).map((partie) => (
          <article
            key={partie.id}
            className="carte"
            style={{
              alignItems: "center",
              display: "flex",
              flexWrap: "wrap",
              gap: "1rem",
              justifyContent: "space-between",
            }}
          >
            <div style={{ minWidth: 240 }}>
              <h2 style={{ fontSize: "1.1rem", margin: "0 0 0.3rem" }}>{partie.quiz_title}</h2>
              <p style={{ color: "var(--color-creme-doux)", fontSize: "0.88rem", margin: 0 }}>
                {new Date(partie.created_at).toLocaleString("fr-FR", {
                  dateStyle: "long",
                  timeStyle: "short",
                })}
                {" · "}
                code <strong>{partie.code}</strong>
                {" · "}
                {partie.player_count} joueur{partie.player_count > 1 ? "s" : ""}
                {" · "}
                {partie.question_count} question{partie.question_count > 1 ? "s" : ""}
              </p>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
              <span className="etiquette">{PHASES[partie.phase] ?? partie.phase}</span>
              <a
                className="bouton-secondaire"
                href={`/api/game/${partie.id}/results`}
                style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
              >
                ⬇ Résultats CSV
              </a>
              <Link
                href={`/formateur/partie/${partie.id}`}
                className="bouton-secondaire"
                style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
              >
                Ouvrir
              </Link>
              <button
                type="button"
                className="bouton-secondaire"
                style={{ borderColor: "var(--color-echec)", color: "#ffc9c0" }}
                onClick={() => void supprimer(partie)}
              >
                Supprimer
              </button>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
