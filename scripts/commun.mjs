/**
 * Outils communs aux scripts (import du quiz d'exemple, simulation).
 * Les scripts parlent à l'application comme le ferait un navigateur :
 * ils ne touchent jamais la base directement, donc ils testent vraiment
 * les règles du serveur.
 */

import fs from "node:fs";
import path from "node:path";

export const BASE = process.env.QUIZ_URL ?? "http://localhost:3000";

/** Lit ADMIN_PASSWORD dans .env.local sans l'afficher. */
export function motDePasseFormateur() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;

  const chemin = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(chemin)) {
    throw new Error(
      "Fichier .env.local introuvable. Copiez .env.example vers .env.local (voir le README).",
    );
  }
  const contenu = fs.readFileSync(chemin, "utf8");
  for (const ligne of contenu.split(/\r?\n/)) {
    const nettoyee = ligne.trim();
    if (nettoyee.startsWith("#")) continue;
    const separateur = nettoyee.indexOf("=");
    if (separateur === -1) continue;
    if (nettoyee.slice(0, separateur).trim() === "ADMIN_PASSWORD") {
      return nettoyee.slice(separateur + 1).trim();
    }
  }
  throw new Error("ADMIN_PASSWORD absent de .env.local.");
}

/** Un petit client qui garde le cookie de session du formateur. */
export function creerClient() {
  let cookie = null;

  async function appel(chemin, options = {}) {
    const entetes = { ...(options.headers ?? {}) };
    if (cookie) entetes.cookie = cookie;
    if (options.body) entetes["Content-Type"] = "application/json";

    const reponse = await fetch(`${BASE}${chemin}`, {
      ...options,
      headers: entetes,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const recu = reponse.headers.getSetCookie?.() ?? [];
    for (const morceau of recu) {
      if (morceau.startsWith("quiz_formateur=")) cookie = morceau.split(";")[0];
    }

    // `brut` sert a verifier les octets exacts (le BOM d'un CSV, que
    // Response.text() supprime silencieusement).
    if (options.brut) {
      const octets = new Uint8Array(await reponse.arrayBuffer());
      return {
        ok: reponse.ok,
        status: reponse.status,
        octets,
        corps: new TextDecoder("utf-8").decode(octets),
      };
    }

    const type = reponse.headers.get("content-type") ?? "";
    const corps = type.includes("application/json")
      ? await reponse.json().catch(() => ({}))
      : await reponse.text();

    return { ok: reponse.ok, status: reponse.status, corps };
  }

  return {
    appel,
    async connexionFormateur() {
      const { ok, corps } = await appel("/api/admin/login", {
        method: "POST",
        body: { password: motDePasseFormateur() },
      });
      if (!ok) {
        throw new Error(
          `Connexion formateur refusée : ${corps.erreur ?? "mot de passe incorrect"}`,
        );
      }
    },
  };
}

export function verifierServeur() {
  return fetch(`${BASE}/api/admin/session`)
    .then(() => true)
    .catch(() => {
      throw new Error(
        `Application injoignable sur ${BASE}. Lancez « npm run dev » dans un autre terminal.`,
      );
    });
}

export const attendre = (ms) => new Promise((resoudre) => setTimeout(resoudre, ms));

/** Petit cadre d'assertions avec un compte-rendu lisible. */
export function creerVerificateur() {
  const echecs = [];
  let total = 0;

  function verifier(description, condition, detail = "") {
    total += 1;
    if (condition) {
      console.log(`  ✓ ${description}`);
    } else {
      console.log(`  ✗ ${description}${detail ? ` — ${detail}` : ""}`);
      echecs.push(description);
    }
  }

  function bilan() {
    console.log("");
    if (echecs.length === 0) {
      console.log(`✅ ${total} vérifications, aucune erreur.`);
      return true;
    }
    console.log(`❌ ${echecs.length} échec(s) sur ${total} vérifications :`);
    for (const echec of echecs) console.log(`   - ${echec}`);
    return false;
  }

  return { verifier, bilan };
}
