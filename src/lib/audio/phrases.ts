/**
 * Les phrases affichées et dites à voix haute après chaque question.
 * 8 par cas, tirées au hasard, pour que ce soit drôle à chaque fois.
 */

export type Reaction = "reussite" | "echecMoqueur" | "echecGentil" | "tropLent";

export const PHRASES: Record<Reaction, string[]> = {
  reussite: [
    "Bravo génie !",
    "Einstein, c'est toi ?",
    "Trop fort !",
    "Personne ne t'arrête !",
    "Quelle rapidité !",
    "Tu gères comme un chef !",
    "Impressionnant !",
    "Champion, tout simplement !",
  ],
  echecMoqueur: [
    "T'es nul, t'as raté !",
    "Aïe aïe aïe…",
    "Même mon grand-père aurait trouvé !",
    "Retourne réviser !",
    "Alors là, complètement à côté !",
    "Oh non, quelle catastrophe !",
    "Mon chat aurait mieux répondu !",
    "Houla, on révise ce soir !",
  ],
  echecGentil: [
    "Pas cette fois, courage !",
    "Presque ! On continue.",
    "Ce n'est pas grave, la prochaine est pour toi.",
    "Bien essayé !",
    "On apprend en se trompant.",
    "Garde le sourire, ça vient.",
    "Pas de panique, continue comme ça.",
    "Allez, on se concentre pour la suite !",
  ],
  tropLent: [
    "Trop lent ! Le temps est écoulé 🐢",
    "Le temps t'a filé entre les doigts !",
    "Trop tard, la tortue t'a battu 🐢",
    "Il fallait appuyer sur un bouton !",
    "Le chrono a gagné cette fois.",
    "Pas de réponse, pas de point !",
    "Tu rêvais ? Le temps est passé.",
    "Plus vite la prochaine fois !",
  ],
};

export const EMOJIS: Record<Reaction, string> = {
  reussite: "🎉",
  echecMoqueur: "😂",
  echecGentil: "💪",
  tropLent: "🐢",
};

export function phraseAuHasard(reaction: Reaction): string {
  const liste = PHRASES[reaction];
  return liste[Math.floor(Math.random() * liste.length)];
}

/** Les emoji ne se prononcent pas : on les retire avant la synthèse vocale. */
export function pourLaVoix(phrase: string): string {
  return phrase
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}
