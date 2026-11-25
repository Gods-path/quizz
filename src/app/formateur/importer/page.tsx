"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GardeFormateur } from "@/components/GardeFormateur";
import { snapDuration } from "@/lib/durations";
import type { Letter, QuestionOption } from "@/lib/types";

interface QuestionApercu {
  line: number;
  position: number;
  theme: string | null;
  domaine: string | null;
  text: string;
  options: QuestionOption[];
  correctLetters: Letter[];
  explanation: string | null;
  durationSeconds: number;
  heavy: boolean;
  locked: boolean;
}

interface Apercu {
  questions: QuestionApercu[];
  totalSeconds: number;
  totalMinutes: number;
  heavyCount: number;
}

export default function PageImport() {
  return (
    <GardeFormateur>
      <Importateur />
    </GardeFormateur>
  );
}

function mmss(secondes: number): string {
  const minutes = Math.floor(secondes / 60);
  const reste = secondes % 60;
  return `${minutes} min ${String(reste).padStart(2, "0")} s`;
}

function Importateur() {
  const router = useRouter();
  const champFichier = useRef<HTMLInputElement | null>(null);

  const [titre, setTitre] = useState("");
  const [minutes, setMinutes] = useState(45);
  const [dureesDuFichier, setDureesDuFichier] = useState(false);
  const [nomFichier, setNomFichier] = useState<string | null>(null);
  const [csv, setCsv] = useState<string | null>(null);

  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [verrous, setVerrous] = useState<Record<number, number>>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const [details, setDetails] = useState<string[]>([]);
  const [occupe, setOccupe] = useState(false);

  const demanderApercu = useCallback(
    async (
      contenu: string,
      minutesVoulues: number,
      fichier: boolean,
      verrousActuels: Record<number, number>,
    ) => {
      setOccupe(true);
      setErreur(null);
      setDetails([]);
      try {
        const reponse = await fetch("/api/quiz/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            csv: contenu,
            title: titre,
            totalMinutes: minutesVoulues,
            useFileDurations: fichier,
            locked: verrousActuels,
          }),
        });
        const donnees = await reponse.json();
        if (!reponse.ok) {
          setApercu(null);
          setErreur(donnees.erreur ?? "Le fichier n'a pas pu être lu.");
          setDetails(Array.isArray(donnees.details) ? donnees.details : []);
          return;
        }
        setApercu(donnees);
      } catch {
        setErreur("Pas de réseau.");
      } finally {
        setOccupe(false);
      }
    },
    [titre],
  );

  async function choisirFichier(event: React.ChangeEvent<HTMLInputElement>) {
    const fichier = event.target.files?.[0];
    if (!fichier) return;

    if (fichier.size > 2_000_000) {
      setErreur("Le fichier est trop gros (2 Mo maximum).");
      return;
    }

    const contenu = await fichier.text();
    setCsv(contenu);
    setNomFichier(fichier.name);
    setVerrous({});
    if (titre === "") {
      // Un titre par défaut tiré du nom du fichier, modifiable ensuite.
      setTitre(fichier.name.replace(/\.csv$/i, "").replace(/[_-]+/g, " ").trim());
    }
    await demanderApercu(contenu, minutes, dureesDuFichier, {});
  }

  async function changerDuree(index: number, valeur: number) {
    if (!csv) return;
    const nouveaux = { ...verrous, [index]: snapDuration(valeur) };
    setVerrous(nouveaux);
    await demanderApercu(csv, minutes, dureesDuFichier, nouveaux);
  }

  async function libererDuree(index: number) {
    if (!csv) return;
    const nouveaux = { ...verrous };
    delete nouveaux[index];
    setVerrous(nouveaux);
    await demanderApercu(csv, minutes, dureesDuFichier, nouveaux);
  }

  async function enregistrer() {
    if (!csv || !apercu) return;
    if (titre.trim() === "") {
      setErreur("Donnez un titre au quiz.");
      return;
    }
    setOccupe(true);
    try {
      const reponse = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csv,
          title: titre,
          totalMinutes: minutes,
          useFileDurations: dureesDuFichier,
          locked: verrous,
        }),
      });
      const donnees = await reponse.json();
      if (!reponse.ok) {
        setErreur(donnees.erreur ?? "Enregistrement impossible.");
        setDetails(Array.isArray(donnees.details) ? donnees.details : []);
        setOccupe(false);
        return;
      }
      router.push("/formateur");
    } catch {
      setErreur("Pas de réseau.");
      setOccupe(false);
    }
  }

  const totalVise = minutes * 60;
  const totalJuste = apercu ? apercu.totalSeconds === totalVise : true;

  return (
    <main style={{ margin: "0 auto", maxWidth: 1000, padding: "1.5rem 1rem 4rem" }}>
      <header style={{ marginBottom: "1.5rem" }}>
        <Link
          href="/formateur"
          style={{ color: "var(--color-encre-doux)", fontSize: "0.9rem" }}
        >
          ← Retour à la bibliothèque
        </Link>
        <h1 style={{ fontSize: "2rem", margin: "0.5rem 0 0" }}>Importer un quiz</h1>
        <p style={{ color: "var(--color-encre-doux)", margin: "0.3rem 0 0" }}>
          N'importe quel sujet : un fichier CSV, un titre, une durée totale.
        </p>
      </header>

      <section className="carte" style={{ marginBottom: "1.2rem" }}>
        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "1fr" }}>
          <div>
            <label htmlFor="titre" style={{ display: "block", marginBottom: "0.4rem" }}>
              Titre du quiz
            </label>
            <input
              id="titre"
              value={titre}
              onChange={(event) => setTitre(event.target.value.slice(0, 120))}
              placeholder="Excel débutant, Culture générale, Claude Module 01…"
            />
          </div>

          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ width: 200 }}>
              <label htmlFor="minutes" style={{ display: "block", marginBottom: "0.4rem" }}>
                Durée totale (minutes)
              </label>
              <input
                id="minutes"
                type="number"
                min={1}
                max={600}
                value={minutes}
                disabled={dureesDuFichier}
                onChange={(event) => {
                  const valeur = Math.max(1, Math.min(600, Number(event.target.value) || 1));
                  setMinutes(valeur);
                  setVerrous({});
                  if (csv) void demanderApercu(csv, valeur, dureesDuFichier, {});
                }}
              />
            </div>
            <label
              style={{
                alignItems: "center",
                cursor: "pointer",
                display: "flex",
                gap: "0.6rem",
                paddingBottom: "0.9rem",
              }}
            >
              <input
                type="checkbox"
                checked={dureesDuFichier}
                onChange={(event) => {
                  const actif = event.target.checked;
                  setDureesDuFichier(actif);
                  setVerrous({});
                  if (csv) void demanderApercu(csv, minutes, actif, {});
                }}
                style={{ width: 22, height: 22, padding: 0 }}
              />
              <span>
                Utiliser les durées du fichier
                <span
                  style={{
                    color: "var(--color-encre-doux)",
                    display: "block",
                    fontSize: "0.82rem",
                  }}
                >
                  (colonne duree_secondes, ignorée par défaut)
                </span>
              </span>
            </label>
          </div>

          <div>
            <label htmlFor="fichier" style={{ display: "block", marginBottom: "0.4rem" }}>
              Fichier CSV des questions
            </label>
            <input
              id="fichier"
              ref={champFichier}
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => void choisirFichier(event)}
            />
            {nomFichier && (
              <p style={{ color: "var(--color-encre-doux)", fontSize: "0.85rem", margin: "0.4rem 0 0" }}>
                Fichier chargé : {nomFichier}
              </p>
            )}
          </div>

          <div>
            <a className="bouton-secondaire" href="/api/quiz/template" style={{ textDecoration: "none" }}>
              ⬇ Télécharger le modèle CSV
            </a>
          </div>
        </div>
      </section>

      {erreur && (
        <section className="erreur" style={{ marginBottom: "1.2rem" }} role="alert">
          <strong>{erreur}</strong>
          {details.length > 0 && (
            <ul style={{ margin: "0.7rem 0 0", paddingLeft: "1.2rem" }}>
              {details.slice(0, 60).map((ligne) => (
                <li key={ligne} style={{ marginBottom: "0.3rem" }}>
                  {ligne}
                </li>
              ))}
              {details.length > 60 && <li>… et {details.length - 60} autres.</li>}
            </ul>
          )}
        </section>
      )}

      {apercu && (
        <section>
          <div
            className="carte"
            style={{
              alignItems: "center",
              display: "flex",
              flexWrap: "wrap",
              gap: "1rem",
              justifyContent: "space-between",
              marginBottom: "1rem",
            }}
          >
            <div>
              <h2 style={{ fontSize: "1.2rem", margin: 0 }}>
                Aperçu : {apercu.questions.length} questions
              </h2>
              <p style={{ color: "var(--color-encre-doux)", margin: "0.3rem 0 0" }}>
                {apercu.heavyCount} question{apercu.heavyCount > 1 ? "s" : ""} comptée
                {apercu.heavyCount > 1 ? "s" : ""} double (longue ou à plusieurs bonnes réponses).
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="titre" style={{ fontSize: "1.6rem" }}>
                {mmss(apercu.totalSeconds)}
              </div>
              <div
                style={{
                  color: totalJuste ? "var(--color-succes)" : "var(--color-echec)",
                  fontSize: "0.85rem",
                }}
              >
                {totalJuste
                  ? `✓ tombe exactement sur ${minutes} minutes`
                  : `attention : ${minutes} minutes demandées`}
              </div>
            </div>
            <button
              type="button"
              className="bouton"
              disabled={occupe}
              onClick={() => void enregistrer()}
            >
              {occupe ? "…" : "Enregistrer le quiz"}
            </button>
          </div>

          <div style={{ display: "grid", gap: "0.7rem" }}>
            {apercu.questions.map((question) => (
              <article
                key={question.position}
                className="carte"
                style={{ padding: "0.9rem 1rem" }}
              >
                <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div
                      style={{
                        color: "var(--color-encre-doux)",
                        fontSize: "0.78rem",
                        marginBottom: "0.3rem",
                      }}
                    >
                      Question {question.position + 1} · ligne {question.line} du fichier
                      {question.heavy && " · compte double"}
                      {question.domaine && ` · ${question.domaine}`}
                    </div>
                    <p style={{ fontWeight: 600, margin: "0 0 0.4rem" }}>{question.text}</p>
                    <div style={{ fontSize: "0.85rem", color: "var(--color-encre-doux)" }}>
                      {question.options.map((option) => (
                        <span key={option.letter} style={{ marginRight: "0.9rem" }}>
                          <strong
                            style={{
                              color: question.correctLetters.includes(option.letter)
                                ? "var(--color-succes)"
                                : undefined,
                            }}
                          >
                            {option.letter}.
                          </strong>{" "}
                          {option.text}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div style={{ textAlign: "right", minWidth: 150 }}>
                    <label
                      htmlFor={`duree-${question.position}`}
                      style={{ display: "block", fontSize: "0.78rem", marginBottom: "0.3rem" }}
                    >
                      Durée (secondes)
                    </label>
                    <input
                      id={`duree-${question.position}`}
                      type="number"
                      min={15}
                      step={5}
                      value={question.durationSeconds}
                      disabled={dureesDuFichier || occupe}
                      onChange={(event) =>
                        void changerDuree(question.position, Number(event.target.value) || 15)
                      }
                      style={{
                        borderColor: question.locked ? "var(--color-vert)" : undefined,
                        textAlign: "center",
                        width: 110,
                      }}
                    />
                    {question.locked && (
                      <button
                        type="button"
                        onClick={() => void libererDuree(question.position)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--color-vert)",
                          cursor: "pointer",
                          fontSize: "0.78rem",
                          marginTop: "0.3rem",
                          padding: 0,
                        }}
                      >
                        fixée à la main — libérer
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
