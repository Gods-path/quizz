"use client";

import { useEffect, useState } from "react";
import { Logo } from "./Logo";

/**
 * Demande le mot de passe formateur, puis laisse passer.
 *
 * Le mot de passe n'est jamais gardé dans le navigateur : le serveur
 * répond en posant un cookie signé, illisible et infalsifiable côté client.
 */
export function GardeFormateur({ children }: { children: React.ReactNode }) {
  const [etat, setEtat] = useState<"verification" | "demande" | "ouvert">(
    "verification",
  );
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    let actif = true;
    (async () => {
      try {
        const reponse = await fetch("/api/admin/session");
        const donnees = await reponse.json();
        if (!actif) return;
        setEtat(donnees.connecte ? "ouvert" : "demande");
      } catch {
        if (actif) setEtat("demande");
      }
    })();
    return () => {
      actif = false;
    };
  }, []);

  async function connecter(event: React.FormEvent) {
    event.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      const reponse = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: motDePasse }),
      });
      const donnees = await reponse.json();
      if (!reponse.ok) {
        setErreur(donnees.erreur ?? "Connexion impossible.");
        setEnvoi(false);
        return;
      }
      setMotDePasse("");
      setEtat("ouvert");
    } catch {
      setErreur("Pas de réseau.");
    }
    setEnvoi(false);
  }

  if (etat === "verification") {
    return (
      <main style={{ padding: "2rem", textAlign: "center" }}>
        <p>Vérification…</p>
      </main>
    );
  }

  if (etat === "demande") {
    return (
      <main
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          margin: "0 auto",
          maxWidth: 460,
          minHeight: "100dvh",
          padding: "1.5rem 1rem",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "1.4rem" }}>
          <Logo largeur={220} priority />
          <h1 style={{ fontSize: "1.6rem", margin: "0.6rem 0 0.2rem" }}>
            Espace formateur
          </h1>
          <p style={{ color: "var(--color-encre-doux)", margin: 0 }}>
            Entrez le mot de passe pour continuer.
          </p>
        </div>

        <form onSubmit={connecter} className="carte">
          <label htmlFor="mdp" style={{ display: "block", marginBottom: "0.4rem" }}>
            Mot de passe
          </label>
          <input
            id="mdp"
            type="password"
            value={motDePasse}
            onChange={(event) => setMotDePasse(event.target.value)}
            autoComplete="current-password"
            autoFocus
          />
          {erreur && (
            <p className="erreur" style={{ marginTop: "1rem" }} role="alert">
              {erreur}
            </p>
          )}
          <button
            type="submit"
            className="bouton"
            disabled={envoi || motDePasse === ""}
            style={{ marginTop: "1.1rem", width: "100%" }}
          >
            {envoi ? "Un instant…" : "Se connecter"}
          </button>
        </form>

        <p
          style={{
            color: "var(--color-encre-doux)",
            fontSize: "0.78rem",
            marginTop: "1.4rem",
            textAlign: "center",
          }}
        >
          Le mot de passe est celui de la variable ADMIN_PASSWORD.
        </p>
      </main>
    );
  }

  return <>{children}</>;
}
