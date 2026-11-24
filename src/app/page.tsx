"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { audio } from "@/lib/audio/engine";
import { CODE_LENGTH, normalizeGameCode } from "@/lib/code";
import {
  ecrireSession,
  effacerSession,
  lireSession,
  type SessionJoueur,
} from "@/lib/session";

export default function PageEntree() {
  const router = useRouter();
  const [nom, setNom] = useState("");
  const [code, setCode] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [reprise, setReprise] = useState<SessionJoueur | null>(null);

  // Reconnexion : si ce téléphone a déjà une place, on la propose.
  useEffect(() => {
    const session = lireSession();
    if (!session) return;
    let actif = true;
    (async () => {
      const reponse = await fetch("/api/player/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: session.playerId,
          token: session.token,
        }),
      });
      if (!actif) return;
      if (reponse.ok) setReprise(session);
      else effacerSession();
    })();
    return () => {
      actif = false;
    };
  }, []);

  async function entrer(event: React.FormEvent) {
    event.preventDefault();
    setErreur(null);

    // Le premier toucher débloque le son et la voix : c'est ici.
    audio().debloquer();
    audio().definirAmbiance("attente");

    if (nom.trim().length < 2) {
      setErreur("Entrez votre nom (2 caractères au minimum).");
      return;
    }
    if (code.length !== CODE_LENGTH) {
      setErreur(`Le code fait ${CODE_LENGTH} caractères, comme à l'écran.`);
      return;
    }

    setEnCours(true);
    try {
      const reponse = await fetch("/api/player/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nom, code }),
      });
      const donnees = await reponse.json();

      if (!reponse.ok) {
        setErreur(donnees.erreur ?? "Impossible de rejoindre le quiz.");
        setEnCours(false);
        return;
      }

      ecrireSession({
        playerId: donnees.playerId,
        token: donnees.token,
        gameId: donnees.gameId,
        code: donnees.code,
      });
      router.push("/jouer");
    } catch {
      setErreur("Pas de réseau. Vérifiez votre connexion et réessayez.");
      setEnCours(false);
    }
  }

  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        minHeight: "100dvh",
        margin: "0 auto",
        maxWidth: 520,
        padding: "1.5rem 1rem",
      }}
    >
      <div className="anim-apparait" style={{ textAlign: "center", marginBottom: "1.6rem" }}>
        <div style={{ fontSize: "3rem" }} aria-hidden>
          🎯
        </div>
        <h1 style={{ fontSize: "2.1rem", margin: "0.3rem 0" }}>Quiz en direct</h1>
        <p style={{ color: "var(--color-creme-doux)", margin: 0 }}>
          Entrez votre nom et le code affiché par le formateur.
        </p>
      </div>

      {reprise && (
        <div className="carte" style={{ marginBottom: "1rem" }}>
          <p style={{ marginTop: 0 }}>
            Vous étiez déjà dans la partie <strong>{reprise.code}</strong>.
          </p>
          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className="bouton"
              onClick={() => {
                audio().debloquer();
                audio().definirAmbiance("attente");
                router.push("/jouer");
              }}
            >
              Reprendre ma place
            </button>
            <button
              type="button"
              className="bouton-secondaire"
              onClick={() => {
                effacerSession();
                setReprise(null);
              }}
            >
              Nouvelle partie
            </button>
          </div>
        </div>
      )}

      <form onSubmit={entrer} className="carte">
        <label htmlFor="nom" style={{ display: "block", marginBottom: "0.4rem" }}>
          Votre nom
        </label>
        <input
          id="nom"
          name="nom"
          value={nom}
          onChange={(event) => setNom(event.target.value.slice(0, 24))}
          maxLength={24}
          autoComplete="off"
          autoCapitalize="words"
          placeholder="Marie"
          enterKeyHint="next"
        />
        <p
          style={{
            color: "var(--color-creme-doux)",
            fontSize: "0.8rem",
            margin: "0.3rem 0 1.1rem",
          }}
        >
          24 caractères au maximum. Visible par toute la classe.
        </p>

        <label htmlFor="code" style={{ display: "block", marginBottom: "0.4rem" }}>
          Code du quiz
        </label>
        <input
          id="code"
          name="code"
          value={code}
          onChange={(event) => setCode(normalizeGameCode(event.target.value))}
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="ABC234"
          enterKeyHint="go"
          style={{
            fontFamily: "var(--font-titre)",
            fontSize: "1.9rem",
            letterSpacing: "0.28em",
            textAlign: "center",
          }}
        />

        {erreur && (
          <p className="erreur" style={{ marginTop: "1rem", marginBottom: 0 }} role="alert">
            {erreur}
          </p>
        )}

        <button
          type="submit"
          className="bouton"
          disabled={enCours}
          style={{ marginTop: "1.2rem", width: "100%" }}
        >
          {enCours ? "Un instant…" : "Entrer dans le quiz"}
        </button>
      </form>

      <p
        style={{
          color: "var(--color-creme-doux)",
          fontSize: "0.78rem",
          marginTop: "1.5rem",
          textAlign: "center",
        }}
      >
        Le son s'active en entrant dans le quiz.
      </p>
    </main>
  );
}
