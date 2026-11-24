/**
 * Nettoyage des valeurs qui arrivent du navigateur.
 *
 * Ces fonctions sont volontairement sans aucune dépendance (ni Next, ni
 * Supabase) : elles sont au cœur de la sécurité des routes, donc elles
 * doivent pouvoir être testées directement.
 */

export function asString(value: unknown, max = 500): string {
  if (typeof value !== "string") return "";
  return value.slice(0, max).trim();
}

/**
 * Convertit en entier, ou null si la valeur est absente ou invalide.
 *
 * Le piège : Number("") vaut 0. Sans le test sur la chaîne vide, une
 * valeur absente devenait 0 au lieu de null, et un « ?? valeurParDefaut »
 * ne s'appliquait jamais (le seuil de réussite tombait à 0 %, et un
 * numéro de question manquant passait pour la question 1).
 */
export function asInt(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value) : null;
  }
  const texte = asString(value, 20);
  if (texte === "") return null;
  const n = Number(texte);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/**
 * Nettoie un nom de joueur : 24 caractères au maximum, pas de caractères
 * de contrôle, espaces normalisés. Le texte reste affiché par React, qui
 * l'échappe : aucun HTML ne peut être injecté.
 */
export function cleanPlayerName(value: unknown): string {
  if (typeof value !== "string") return "";
  return (
    value
      // Tabulation, retour à la ligne... deviennent une ESPACE : sinon
      // « Marie<retour>Paul » donnerait « MariePaul », collé.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0009-\u000d]/g, " ")
      // Les autres caractères de contrôle, eux, disparaissent.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000e-\u001f\u007f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 24)
  );
}
