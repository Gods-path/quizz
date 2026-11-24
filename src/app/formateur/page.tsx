"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GardeFormateur } from "@/components/GardeFormateur";
import { audio } from "@/lib/audio/engine";
import type { Letter, QuestionOption } from "@/lib/types";

interface Quiz {
  id: string;
  title: string;
  total_duration_minutes: number;
  question_count: number;
  created_at: string;
}

interface QuestionDetail {
  id: string;
  position: number;
  theme: string | null;
  domaine: string | null;
  text: string;
  options: QuestionOption[];
  correct_letters: Letter[];
  duration_seconds: number;
  explanation: string | null;
}

export default function PageFormateur() {
  return (
    <GardeFormateur>
      <Bibliotheque />
    </GardeFormateur>
  );
}

function Bibliotheque() {
  const router = useRouter();
  const [quiz, setQuiz] = useState<Quiz[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState<string | null>(null);
  const [questions, setQuestions] = useState<{
    quizId: string;
    titre: string;
    liste: QuestionDetail[];
  } | null>(null);
  const [reglages, setReglages] = useState({ seuil: 72, moqueur: true });

  const charger = useCallback(async () => {
    try {
      const reponse = await fetch("/api/quiz");
      const donnees = await reponse.json();
      if (!reponse.ok) {
        setErreur(donnees.erreur ?? "Impossible de charger les quiz.");
        return;
      }
      setQuiz(donnees.quiz);
      setErreur(null);
    } catch {
      setErreur("Pas de réseau.");
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function creerPartie(quizId: string) {
    // Premier geste du formateur : on débloque le son de l'écran projeté.
    audio().debloquer();
    setOccupe(quizId);
    try {
      const reponse = await fetch("/api/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quizId,
          passThreshold: reglages.seuil,
          mockMode: reglages.moqueur,
        }),
      });
      const donnees = await reponse.json();
      if (!reponse.ok) {
        setErreur(donnees.erreur ?? "Impossible de créer la partie.");
        setOccupe(null);
        return;
      }
      router.push(`/formateur/partie/${donnees.partie.id}`);
    } catch {
      setErreur("Pas de réseau.");
      setOccupe(null);
    }
  }

  async function renommer(quiz: Quiz) {
    const titre = window.prompt("Nouveau titre du quiz :", quiz.title);
    if (titre === null || titre.trim() === "") return;
    await modifier(quiz.id, { title: titre.trim() });
  }

  async function changerDuree(quiz: Quiz) {
    const saisie = window.prompt(
      `Nouvelle durée totale en minutes pour « ${quiz.title} » ?\n` +
        `Les durées des ${quiz.question_count} questions seront recalculées.`,
      String(quiz.total_duration_minutes),
    );
    if (saisie === null) return;
    const minutes = Number(saisie);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      setErreur("Durée invalide : indiquez un nombre de minutes.");
      return;
    }
    await modifier(quiz.id, { totalMinutes: Math.round(minutes) });
  }

  async function modifier(id: string, corps: Record<string, unknown>) {
    setOccupe(id);
    try {
      const reponse = await fetch(`/api/quiz/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps),
      });
      const donnees = await reponse.json();
      if (!reponse.ok) setErreur(donnees.erreur ?? "Modification impossible.");
      else {
        setErreur(null);
        await charger();
      }
    } catch {
      setErreur("Pas de réseau.");
    }
    setOccupe(null);
  }

  async function supprimer(quiz: Quiz) {
    const sur = window.confirm(
      `Supprimer « ${quiz.title} » et ses ${quiz.question_count} questions ?\n` +
        `Les parties déjà jouées avec ce quiz seront aussi supprimées.\n` +
        `Cette action est définitive.`,
    );
    if (!sur) return;
    setOccupe(quiz.id);
    try {
      const reponse = await fetch(`/api/quiz/${quiz.id}`, { method: "DELETE" });
      if (!reponse.ok) {
        const donnees = await reponse.json();
        setErreur(donnees.erreur ?? "Suppression impossible.");
      } else await charger();
    } catch {
      setErreur("Pas de réseau.");
    }
    setOccupe(null);
  }

  async function voirQuestions(quiz: Quiz) {
    if (questions?.quizId === quiz.id) {
      setQuestions(null);
      return;
    }
    const reponse = await fetch(`/api/quiz/${quiz.id}`);
    const donnees = await reponse.json();
    if (!reponse.ok) {
      setErreur(donnees.erreur ?? "Impossible de lire les questions.");
      return;
    }
    setQuestions({ quizId: quiz.id, titre: quiz.title, liste: donnees.questions });
  }

  return (
    <main style={{ margin: "0 auto", maxWidth: 1000, padding: "1.5rem 1rem 4rem" }}>
      <header
        style={{
          alignItems: "center",
          display: "flex",
          flexWrap: "wrap",
          gap: "1rem",
          justifyContent: "space-between",
          marginBottom: "1.5rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "2rem", margin: 0 }}>Espace formateur</h1>
          <p style={{ color: "var(--color-creme-doux)", margin: "0.3rem 0 0" }}>
            Importez un quiz, puis lancez une partie.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
          <Link href="/formateur/importer" className="bouton" style={{ textDecoration: "none" }}>
            + Importer un quiz
          </Link>
          <Link
            href="/formateur/historique"
            className="bouton-secondaire"
            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
          >
            Historique
          </Link>
          <button
            type="button"
            className="bouton-secondaire"
            onClick={async () => {
              await fetch("/api/admin/logout", { method: "POST" });
              window.location.reload();
            }}
          >
            Se déconnecter
          </button>
        </div>
      </header>

      {erreur && (
        <p className="erreur" style={{ marginBottom: "1rem" }} role="alert">
          {erreur}
        </p>
      )}

      <section className="carte" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.2rem", marginTop: 0 }}>Réglages de la prochaine partie</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "1.5rem", alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <span>Seuil de réussite</span>
            <input
              type="number"
              min={0}
              max={100}
              value={reglages.seuil}
              onChange={(event) =>
                setReglages((avant) => ({
                  ...avant,
                  seuil: Math.max(0, Math.min(100, Number(event.target.value) || 0)),
                }))
              }
              style={{ width: 90, textAlign: "center" }}
            />
            <span>%</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={reglages.moqueur}
              onChange={(event) =>
                setReglages((avant) => ({ ...avant, moqueur: event.target.checked }))
              }
              style={{ width: 22, height: 22, padding: 0 }}
            />
            <span>
              Mode moqueur{" "}
              <span style={{ color: "var(--color-creme-doux)", fontSize: "0.85rem" }}>
                ({reglages.moqueur ? "« T'es nul, t'as raté ! »" : "« Pas cette fois, courage ! »"})
              </span>
            </span>
          </label>
        </div>
      </section>

      <h2 style={{ fontSize: "1.3rem" }}>Bibliothèque de quiz</h2>

      {quiz === null && <p>Chargement…</p>}

      {quiz !== null && quiz.length === 0 && (
        <div className="carte" style={{ textAlign: "center" }}>
          <p>Aucun quiz pour le moment.</p>
          <Link href="/formateur/importer" className="bouton" style={{ textDecoration: "none" }}>
            Importer mon premier quiz
          </Link>
        </div>
      )}

      <div style={{ display: "grid", gap: "1rem" }}>
        {(quiz ?? []).map((item) => (
          <article key={item.id} className="carte">
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "1rem",
                justifyContent: "space-between",
              }}
            >
              <div style={{ minWidth: 220, flex: 1 }}>
                <h3 style={{ fontSize: "1.25rem", margin: "0 0 0.4rem" }}>{item.title}</h3>
                <p style={{ color: "var(--color-creme-doux)", margin: 0 }}>
                  {item.question_count} question{item.question_count > 1 ? "s" : ""} ·{" "}
                  {item.total_duration_minutes} minutes
                </p>
              </div>
              <div
                style={{
                  alignItems: "center",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                }}
              >
                <button
                  type="button"
                  className="bouton"
                  disabled={occupe === item.id || item.question_count === 0}
                  onClick={() => void creerPartie(item.id)}
                >
                  {occupe === item.id ? "…" : "Créer une partie"}
                </button>
                <button type="button" className="bouton-secondaire" onClick={() => void voirQuestions(item)}>
                  {questions?.quizId === item.id ? "Masquer" : "Voir les questions"}
                </button>
                <button type="button" className="bouton-secondaire" onClick={() => void renommer(item)}>
                  Renommer
                </button>
                <button type="button" className="bouton-secondaire" onClick={() => void changerDuree(item)}>
                  Changer la durée
                </button>
                <a
                  className="bouton-secondaire"
                  href={`/api/quiz/${item.id}/export`}
                  style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                >
                  Exporter en CSV
                </a>
                <button
                  type="button"
                  className="bouton-secondaire"
                  style={{ borderColor: "var(--color-echec)", color: "#ffc9c0" }}
                  onClick={() => void supprimer(item)}
                >
                  Supprimer
                </button>
              </div>
            </div>

            {questions?.quizId === item.id && (
              <div style={{ marginTop: "1.2rem" }}>
                <table style={{ borderCollapse: "collapse", fontSize: "0.9rem", width: "100%" }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--color-creme-doux)" }}>
                      <th style={{ padding: "0.4rem" }}>#</th>
                      <th style={{ padding: "0.4rem" }}>Question</th>
                      <th style={{ padding: "0.4rem" }}>Bonne(s)</th>
                      <th style={{ padding: "0.4rem" }}>Durée</th>
                    </tr>
                  </thead>
                  <tbody>
                    {questions.liste.map((question) => (
                      <tr key={question.id} style={{ borderTop: "1px solid var(--color-bord)" }}>
                        <td style={{ padding: "0.5rem 0.4rem", verticalAlign: "top" }}>
                          {question.position + 1}
                        </td>
                        <td style={{ padding: "0.5rem 0.4rem" }}>
                          {question.text}
                          <div style={{ color: "var(--color-creme-doux)", fontSize: "0.82rem", marginTop: 4 }}>
                            {question.options
                              .map((option) => `${option.letter}. ${option.text}`)
                              .join(" · ")}
                          </div>
                        </td>
                        <td style={{ padding: "0.5rem 0.4rem", verticalAlign: "top" }}>
                          <strong>{question.correct_letters.join(";")}</strong>
                        </td>
                        <td style={{ padding: "0.5rem 0.4rem", verticalAlign: "top", whiteSpace: "nowrap" }}>
                          {question.duration_seconds} s
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        ))}
      </div>
    </main>
  );
}
