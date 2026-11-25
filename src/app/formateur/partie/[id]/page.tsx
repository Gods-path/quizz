"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { BoutonReponse } from "@/components/BoutonReponse";
import { Chrono } from "@/components/Chrono";
import { ClassementPlein } from "@/components/ClassementPlein";
import { Confettis } from "@/components/Confettis";
import { GardeFormateur } from "@/components/GardeFormateur";
import { Pastille } from "@/components/Pastille";
import { Podium } from "@/components/Podium";
import { audio } from "@/lib/audio/engine";
import { useRealtimeGame } from "@/lib/useRealtimeGame";
import type { GamePhase, Letter, QuestionOption } from "@/lib/types";

interface Partie {
  id: string;
  code: string;
  quiz_title: string;
  question_count: number;
  phase: GamePhase;
  current_index: number;
  question_duration_seconds: number | null;
  paused_at: string | null;
  answered_count: number;
  player_count: number;
  pass_threshold: number;
  mock_mode: boolean;
}

interface Classe {
  rank: number;
  id: string;
  name: string;
  score: number;
  correct_count: number;
  answered_count: number;
  streak: number;
}

interface EtatPartie {
  partie: Partie;
  joueurs: { id: string; name: string; score: number; joined_at: string }[];
  classement: Classe[];
  tempsRestantMs: number;
  question?: {
    index: number;
    total: number;
    theme: string | null;
    domaine: string | null;
    text: string;
    options: QuestionOption[];
    durationSeconds: number;
    multiple: boolean;
    correctLetters?: Letter[];
    explanation?: string | null;
  };
  repartition?: { letter: Letter; count: number }[];
  bonnesReponsesCount?: number;
  sansReponse?: number;
}

/**
 * La correction se joue en deux temps sur l'écran projeté :
 *   1. la bonne réponse et la répartition des réponses ;
 *   2. le classement en plein écran, barres animées.
 * Le formateur peut couper court à tout moment avec « Question suivante ».
 */
const DUREE_CORRECTION_MS = 4500;
const DUREE_CLASSEMENT_MS = 5000;

export default function PagePartie({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <GardeFormateur>
      <EcranPartie gameId={id} />
    </GardeFormateur>
  );
}

function EcranPartie({ gameId }: { gameId: string }) {
  const [etat, setEtat] = useState<EtatPartie | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [restantMs, setRestantMs] = useState(0);
  const [arrivee, setArrivee] = useState<string | null>(null);
  /** Pendant la correction : d'abord la réponse, puis le classement. */
  const [etapeCorrection, setEtapeCorrection] = useState<"reponse" | "classement">(
    "reponse",
  );

  const recuA = useRef(0);
  const connus = useRef<Set<string>>(new Set());
  const enCoursAvance = useRef(false);
  const revelationA = useRef<number>(0);
  const fanfareFaite = useRef(false);

  // Valeurs simples, pour que les minuteurs ne dépendent pas de l'objet
  // d'état complet (qui change à chaque rafraîchissement).
  const phaseActuelle = etat?.partie.phase;
  const indexActuel = etat?.partie.current_index;

  // ------------------------------------------------------------- lecture
  const rafraichir = useCallback(async () => {
    try {
      const reponse = await fetch(`/api/game/${gameId}/state`);
      const donnees = await reponse.json();
      if (!reponse.ok) {
        setErreur(donnees.erreur ?? "Impossible de lire la partie.");
        return;
      }
      setErreur(null);
      recuA.current = Date.now();
      setRestantMs(donnees.tempsRestantMs ?? 0);
      setEtat(donnees);
    } catch {
      setErreur("Pas de réseau.");
    }
  }, [gameId]);

  useEffect(() => {
    void rafraichir();
    // Si cet écran est rouvert depuis l'historique, aucun clic n'a eu lieu :
    // le son se débloquera au premier toucher.
    audio().armerPremierGeste();
  }, [rafraichir]);

  useRealtimeGame(gameId, rafraichir, 3000);

  // ------------------------------------------- « Marie a rejoint le quiz ! »
  useEffect(() => {
    if (!etat) return;
    if (etat.partie.phase !== "lobby") {
      connus.current = new Set(etat.joueurs.map((joueur) => joueur.id));
      return;
    }
    for (const joueur of etat.joueurs) {
      if (!connus.current.has(joueur.id)) {
        connus.current.add(joueur.id);
        // Ne pas annoncer tout le monde au premier chargement de la page.
        if (connus.current.size > 1 || etat.joueurs.length === 1) {
          setArrivee(`${joueur.name} a rejoint le quiz !`);
        }
      }
    }
  }, [etat]);

  useEffect(() => {
    if (!arrivee) return;
    const minuteur = setTimeout(() => setArrivee(null), 2800);
    return () => clearTimeout(minuteur);
  }, [arrivee]);

  // ----------------------------------------------------- musique d'ambiance
  useEffect(() => {
    if (!etat) return;
    const phase = etat.partie.phase;
    if (phase === "lobby") audio().definirAmbiance("attente");
    else if (phase === "question") audio().definirAmbiance("question");
    else if (phase === "reveal") audio().definirAmbiance("revelation");
    else if (phase === "finished") {
      audio().definirAmbiance("finale");
      if (!fanfareFaite.current) {
        fanfareFaite.current = true;
        audio().fanfare();
      }
    }
  }, [etat?.partie.phase]);

  // ------------------------------------------------- avancer (côté serveur)
  const avancer = useCallback(
    async (force = false) => {
      if (!etat || enCoursAvance.current) return;
      enCoursAvance.current = true;
      try {
        const reponse = await fetch(`/api/game/${gameId}/advance`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromPhase: etat.partie.phase,
            fromIndex: etat.partie.current_index,
            force,
          }),
        });
        const donnees = await reponse.json();
        // 409 = l'écran était en retard : le serveur a refusé, c'est voulu.
        if (!reponse.ok && reponse.status !== 409) {
          setErreur(donnees.erreur ?? "Impossible d'avancer.");
        }
      } catch {
        setErreur("Pas de réseau.");
      } finally {
        enCoursAvance.current = false;
        await rafraichir();
      }
    },
    [etat, gameId, rafraichir],
  );

  // --------------------------- chrono local + fin de question automatique
  useEffect(() => {
    if (!etat || etat.partie.phase !== "question") return;
    if (etat.partie.paused_at) return;

    const base = etat.tempsRestantMs;
    const horloge = setInterval(() => {
      const restant = Math.max(0, base - (Date.now() - recuA.current));
      setRestantMs(restant);
      audio().definirTempsRestant(Math.ceil(restant / 1000));
      if (restant <= 0) void avancer();
    }, 200);
    return () => clearInterval(horloge);
  }, [etat, avancer]);

  // Tout le monde a répondu : on corrige sans attendre la fin du temps.
  useEffect(() => {
    if (!etat || etat.partie.phase !== "question") return;
    const { answered_count, player_count } = etat.partie;
    if (player_count > 0 && answered_count >= player_count) void avancer();
  }, [etat, avancer]);

  // Correction affichée : question suivante au bout de 5 secondes.
  //
  // Attention au piège : cet effet ne doit dépendre QUE de la phase et du
  // numéro de question. S'il dépendait de l'état entier (ou de `avancer`,
  // qui est recréé à chaque état), le rafraîchissement toutes les 3 s
  // remettrait le minuteur à zéro et les 5 secondes ne tomberaient jamais.
  const avancerRef = useRef(avancer);
  avancerRef.current = avancer;

  useEffect(() => {
    if (phaseActuelle !== "reveal") {
      setEtapeCorrection("reponse");
      return;
    }
    revelationA.current = Date.now();
    setEtapeCorrection("reponse");

    const versClassement = setTimeout(
      () => setEtapeCorrection("classement"),
      DUREE_CORRECTION_MS,
    );
    const versSuite = setTimeout(
      () => void avancerRef.current(),
      DUREE_CORRECTION_MS + DUREE_CLASSEMENT_MS,
    );

    return () => {
      clearTimeout(versClassement);
      clearTimeout(versSuite);
    };
  }, [phaseActuelle, indexActuel]);

  async function basculerPause() {
    if (!etat) return;
    await fetch(`/api/game/${gameId}/pause`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pause: etat.partie.paused_at === null }),
    });
    await rafraichir();
  }

  async function terminer() {
    if (!window.confirm("Terminer le quiz maintenant ?")) return;
    await fetch(`/api/game/${gameId}/end`, { method: "POST" });
    await rafraichir();
  }

  async function retirer(playerId: string, nom: string) {
    if (!window.confirm(`Retirer ${nom} de la partie ?`)) return;
    await fetch(`/api/game/${gameId}/kick`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId }),
    });
    await rafraichir();
  }

  if (erreur && !etat) {
    return (
      <main style={{ padding: "2rem" }}>
        <p className="erreur">{erreur}</p>
        <Link href="/formateur" className="bouton" style={{ textDecoration: "none" }}>
          Retour
        </Link>
      </main>
    );
  }

  if (!etat) {
    return (
      <main style={{ padding: "2rem", textAlign: "center" }}>
        <p>Chargement de la partie…</p>
      </main>
    );
  }

  const { partie, question, classement } = etat;

  // ======================================================== SALLE D'ATTENTE
  if (partie.phase === "lobby") {
    const adresse =
      process.env.NEXT_PUBLIC_APP_URL ??
      (typeof window !== "undefined" ? window.location.origin : "");

    return (
      <main className="ecran-projete" style={{ padding: "1.5rem 1rem 3rem" }}>
        {arrivee && (
          <div
            className="anim-apparait"
            style={{
              background: "var(--color-succes)",
              borderRadius: "0.9rem",
              color: "#fff",
              fontSize: "1.2rem",
              left: "50%",
              padding: "0.8rem 1.4rem",
              position: "fixed",
              top: "1rem",
              transform: "translateX(-50%)",
              zIndex: 60,
            }}
            role="status"
          >
            🎉 {arrivee}
          </div>
        )}

        <div style={{ margin: "0 auto", maxWidth: 1200 }}>
          <div style={{ textAlign: "center" }}>
            <p className="etiquette">{partie.quiz_title}</p>
            <h1 style={{ fontSize: "clamp(1.4rem, 3vw, 2.2rem)", margin: "0.8rem 0 0.2rem" }}>
              Rejoignez le quiz
            </h1>
            <p style={{ color: "var(--color-encre-doux)", margin: 0 }}>
              Ouvrez <strong>{adresse.replace(/^https?:\/\//, "")}</strong> sur votre téléphone
            </p>
          </div>

          <div
            style={{
              alignItems: "center",
              display: "flex",
              flexWrap: "wrap",
              gap: "2rem",
              justifyContent: "center",
              margin: "1.5rem 0",
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  color: "var(--color-encre-doux)",
                  fontSize: "1rem",
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                }}
              >
                Code du quiz
              </div>
              <div className="code-partie" style={{ color: "var(--color-vert-clair)" }}>
                {partie.code}
              </div>
            </div>

            <div
              style={{
                background: "#fff",
                borderRadius: "1rem",
                lineHeight: 0,
                padding: "0.9rem",
              }}
            >
              <QRCodeSVG value={adresse} size={190} level="M" />
            </div>
          </div>

          <section className="carte">
            <div
              style={{
                alignItems: "center",
                display: "flex",
                flexWrap: "wrap",
                gap: "1rem",
                justifyContent: "space-between",
                marginBottom: "1rem",
              }}
            >
              <h2 style={{ fontSize: "1.4rem", margin: 0 }}>
                Dans la salle · {partie.player_count}{" "}
                {partie.player_count > 1 ? "joueurs" : "joueur"}
              </h2>
              <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                <span className="etiquette">Seuil {partie.pass_threshold} %</span>
                <span className="etiquette">
                  Mode moqueur {partie.mock_mode ? "activé" : "désactivé"}
                </span>
                <button
                  type="button"
                  className="bouton"
                  disabled={partie.player_count < 1}
                  onClick={() => void avancer()}
                >
                  ▶ Lancer le quiz
                </button>
              </div>
            </div>

            {etat.joueurs.length === 0 ? (
              <p style={{ color: "var(--color-encre-doux)", textAlign: "center" }}>
                En attente du premier apprenant…
              </p>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "1rem",
                  justifyContent: "center",
                }}
              >
                {etat.joueurs.map((joueur) => (
                  <Pastille
                    key={joueur.id}
                    nom={joueur.name}
                    surRetrait={() => void retirer(joueur.id, joueur.name)}
                  />
                ))}
              </div>
            )}
          </section>

          <p style={{ color: "var(--color-encre-doux)", fontSize: "0.85rem", marginTop: "1rem", textAlign: "center" }}>
            Gardez cet écran ouvert pendant tout le quiz : c'est lui qui fait avancer les questions.
          </p>
        </div>
      </main>
    );
  }

  // ============================================================ FIN DE PARTIE
  if (partie.phase === "finished") {
    const pourcentageDe = (joueur: Classe) =>
      partie.question_count > 0
        ? Math.round((joueur.correct_count / partie.question_count) * 1000) / 10
        : 0;

    return (
      <main className="ecran-projete" style={{ padding: "1.5rem 1rem 4rem" }}>
        <Confettis actif duree={4000} nombre={140} />
        <div style={{ margin: "0 auto", maxWidth: 1100 }}>
          <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
            <p className="etiquette">{partie.quiz_title}</p>
            <h1 style={{ fontSize: "clamp(1.8rem, 4vw, 3rem)", margin: "0.6rem 0 0" }}>
              🏆 Résultats
            </h1>
          </div>

          {classement.length > 0 && (
            <div style={{ marginBottom: "2.5rem" }}>
              <Podium places={classement.slice(0, 3)} />
            </div>
          )}

          <div
            style={{
              display: "flex",
              gap: "0.7rem",
              flexWrap: "wrap",
              justifyContent: "center",
              marginBottom: "1.5rem",
            }}
          >
            <a
              className="bouton"
              href={`/api/game/${gameId}/results`}
              style={{ textDecoration: "none" }}
            >
              <span style={{ fontFamily: "var(--font-texte)" }}>⬇</span>{" "}
              Exporter les résultats en CSV
            </a>
            <Link href="/formateur" className="bouton-secondaire" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
              Retour à la bibliothèque
            </Link>
          </div>

          <section className="carte" style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", minWidth: 640, width: "100%" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--color-encre-doux)" }}>
                  <th style={{ padding: "0.6rem" }}>Rang</th>
                  <th style={{ padding: "0.6rem" }}>Nom</th>
                  <th style={{ padding: "0.6rem" }}>Points</th>
                  <th style={{ padding: "0.6rem" }}>Bonnes réponses</th>
                  <th style={{ padding: "0.6rem" }}>%</th>
                  <th style={{ padding: "0.6rem" }}>Résultat</th>
                </tr>
              </thead>
              <tbody>
                {classement.map((joueur) => {
                  const pourcentage = pourcentageDe(joueur);
                  const reussi = pourcentage >= partie.pass_threshold;
                  return (
                    <tr key={joueur.id} style={{ borderTop: "1px solid #d7e3d2" }}>
                      <td className="chiffre" style={{ padding: "0.6rem", fontSize: "1.1rem" }}>
                        {joueur.rank}
                      </td>
                      <td style={{ padding: "0.6rem" }}>{joueur.name}</td>
                      <td className="chiffre" style={{ padding: "0.6rem" }}>
                        {joueur.score}
                      </td>
                      <td style={{ padding: "0.6rem" }}>
                        {joueur.correct_count} / {partie.question_count}
                      </td>
                      <td style={{ padding: "0.6rem" }}>
                        {pourcentage.toString().replace(".", ",")} %
                      </td>
                      <td style={{ padding: "0.6rem" }}>
                        <span
                          style={{
                            background: reussi ? "var(--color-succes)" : "var(--color-echec)",
                            borderRadius: 999,
                            color: "#fff",
                            fontSize: "0.85rem",
                            padding: "0.25rem 0.7rem",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {reussi ? "Réussi" : "À retravailler"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </div>
      </main>
    );
  }

  // ============================ CLASSEMENT PLEIN ÉCRAN, ENTRE DEUX QUESTIONS
  // C'est le moment où chacun voit où il en est. Il s'affiche après la
  // bonne réponse, puis la question suivante arrive toute seule.
  if (partie.phase === "reveal" && etapeCorrection === "classement") {
    const derniere = partie.current_index + 1 >= partie.question_count;
    return (
      <main className="ecran-projete">
        <ClassementPlein
          joueurs={classement}
          titre={derniere ? "Classement final" : "Classement"}
          sousTitre={`Après la question ${partie.current_index + 1} sur ${partie.question_count}`}
        />

        {/* Les commandes restent accessibles : le formateur n'est jamais
            obligé d'attendre la fin de l'animation. */}
        <div
          style={{
            bottom: "clamp(0.8rem, 3vh, 2rem)",
            display: "flex",
            gap: "0.7rem",
            justifyContent: "center",
            left: 0,
            position: "fixed",
            right: 0,
            zIndex: 5,
          }}
        >
          <button
            type="button"
            className="bouton"
            style={{ background: "#fff", boxShadow: "0 6px 0 rgba(0,0,0,0.18)", color: "var(--color-vert-fonce)" }}
            onClick={() => void avancer(true)}
          >
            {derniere ? "Voir les résultats" : "Question suivante →"}
          </button>
          <button
            type="button"
            className="bouton-secondaire"
            onClick={() => void terminer()}
          >
            Terminer le quiz
          </button>
        </div>
      </main>
    );
  }

  // ====================================================== QUESTION / CORRECTION
  const corrige = partie.phase === "reveal";
  const total = question?.total ?? partie.question_count;
  const progression = ((partie.current_index + (corrige ? 1 : 0)) / Math.max(1, total)) * 100;
  const maxReponses = Math.max(1, ...(etat.repartition ?? []).map((part) => part.count));

  return (
    <main className="ecran-projete" style={{ padding: "1rem 1rem 2rem" }}>
      <div style={{ margin: "0 auto", maxWidth: 1400 }}>
        {/* En-tête : progression et chrono */}
        <div
          style={{
            alignItems: "center",
            display: "flex",
            gap: "1.5rem",
            justifyContent: "space-between",
            marginBottom: "0.8rem",
          }}
        >
          <div style={{ flex: 1 }}>
            <div
              className="titre"
              style={{ fontSize: "clamp(1rem, 1.8vw, 1.6rem)", marginBottom: "0.4rem" }}
            >
              Question {partie.current_index + 1} / {total}
              {question?.domaine && (
                <span
                  style={{
                    color: "var(--color-encre-doux)",
                    fontFamily: "var(--font-texte)",
                    fontSize: "0.9rem",
                    marginLeft: "1rem",
                  }}
                >
                  {question.domaine}
                </span>
              )}
            </div>
            <div className="jauge">
              <div style={{ width: `${progression}%` }} />
            </div>
          </div>

          {!corrige && (
            <Chrono
              secondesRestantes={restantMs / 1000}
              dureeTotale={question?.durationSeconds ?? 0}
              taille={128}
            />
          )}

          <div style={{ textAlign: "center", minWidth: 150 }}>
            <div className="chiffre" style={{ fontSize: "clamp(1.4rem, 2.6vw, 2.4rem)" }}>
              {partie.answered_count} / {partie.player_count}
            </div>
            <div style={{ color: "var(--color-encre-doux)", fontSize: "0.9rem" }}>
              ont répondu
            </div>
          </div>
        </div>

        {partie.paused_at && (
          <p
            className="carte anim-pulse"
            style={{ fontSize: "1.3rem", margin: "0.6rem 0", textAlign: "center" }}
          >
            ⏸️ Quiz en pause
          </p>
        )}

        {/* La question */}
        <h1
          className="question-texte"
          style={{ margin: "1.2rem 0", textAlign: "center" }}
        >
          {question?.text}
        </h1>

        {question?.multiple && !corrige && (
          <p style={{ textAlign: "center", marginTop: "-0.5rem" }}>
            <span className="etiquette" style={{ fontSize: "1rem" }}>
              Plusieurs bonnes réponses
            </span>
          </p>
        )}

        {/* Les réponses */}
        <div
          style={{
            display: "grid",
            gap: "0.9rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            marginTop: "1.2rem",
          }}
        >
          {(question?.options ?? []).map((option) => {
            const part = etat.repartition?.find((ligne) => ligne.letter === option.letter);
            return (
              <div key={option.letter}>
                <BoutonReponse
                  letter={option.letter}
                  text={option.text}
                  estime={
                    corrige
                      ? question?.correctLetters?.includes(option.letter)
                        ? "bonne"
                        : "mauvaise"
                      : null
                  }
                  marque={corrige && part ? String(part.count) : undefined}
                />
                {corrige && part && (
                  <div
                    style={{
                      background: "var(--color-fond-doux)",
                      borderRadius: 999,
                      height: 14,
                      marginTop: 6,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        background: question?.correctLetters?.includes(option.letter)
                          ? "var(--color-succes)"
                          : "#d7e3d2",
                        height: "100%",
                        transition: "width 0.5s ease",
                        width: `${(part.count / maxReponses) * 100}%`,
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Correction : la bonne réponse et l'explication.
            Le classement a son PROPRE écran, juste après : il ne doit
            jamais être affiché en même temps que la question. */}
        {corrige && (
          <div
            style={{
              display: "grid",
              gap: "1rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              marginTop: "1.5rem",
            }}
          >
            <section className="carte">
              <h2 className="texte-normal" style={{ fontSize: "1.2rem", marginTop: 0 }}>
                ✅ {etat.bonnesReponsesCount ?? 0} bonne
                {(etat.bonnesReponsesCount ?? 0) > 1 ? "s" : ""} réponse
                {(etat.bonnesReponsesCount ?? 0) > 1 ? "s" : ""}
                {(etat.sansReponse ?? 0) > 0 && (
                  <span style={{ color: "var(--color-encre-doux)", fontSize: "0.9rem" }}>
                    {" "}
                    · {etat.sansReponse} sans réponse
                  </span>
                )}
              </h2>
              {question?.explanation && (
                <p style={{ fontSize: "1.05rem", margin: 0 }}>💡 {question.explanation}</p>
              )}
            </section>

          </div>
        )}

        {/* Commandes du formateur */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.7rem",
            justifyContent: "center",
            marginTop: "1.8rem",
          }}
        >
          {!corrige && (
            <button type="button" className="bouton-secondaire" onClick={() => void basculerPause()}>
              {partie.paused_at ? "▶ Reprendre" : "⏸ Pause"}
            </button>
          )}
          <button type="button" className="bouton" onClick={() => void avancer(true)}>
            {corrige
              ? partie.current_index + 1 >= total
                ? "Voir les résultats"
                : "Question suivante →"
              : "Corriger maintenant →"}
          </button>
          <button
            type="button"
            className="bouton-secondaire"
            style={{ borderColor: "var(--color-echec)", color: "#ffc9c0" }}
            onClick={() => void terminer()}
          >
            Terminer le quiz
          </button>
        </div>

        {erreur && (
          <p className="erreur" style={{ marginTop: "1rem" }} role="alert">
            {erreur}
          </p>
        )}
      </div>
    </main>
  );
}
