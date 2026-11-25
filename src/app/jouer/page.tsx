"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BoutonReponse } from "@/components/BoutonReponse";
import { Chrono } from "@/components/Chrono";
import { ClassementPlein } from "@/components/ClassementPlein";
import { Confettis } from "@/components/Confettis";
import { audio } from "@/lib/audio/engine";
import { EMOJIS, phraseAuHasard, pourLaVoix, type Reaction } from "@/lib/audio/phrases";
import { appelJoueur, effacerSession, lireSession, type SessionJoueur } from "@/lib/session";
import { useRealtimeGame, type LignePartie } from "@/lib/useRealtimeGame";
import type { GamePhase, Letter, QuestionOption } from "@/lib/types";

interface EtatJoueur {
  phase: GamePhase;
  code: string;
  quizTitre: string;
  modeMoqueur: boolean;
  nom: string;
  score: number;
  rang: number;
  joueurs: number;
  questionCount: number;
  index: number;
  question?: {
    index: number;
    total: number;
    text: string;
    options: QuestionOption[];
    durationSeconds?: number;
    multiple?: boolean;
  };
  enPause?: boolean;
  tempsRestantMs?: number;
  aRepondu?: boolean;
  maSelection?: Letter[];
  ontRepondu?: number;
  resultat?: {
    aRepondu: boolean;
    juste: boolean;
    maSelection: Letter[];
    bonnesReponses: Letter[];
    explication: string | null;
    pointsGagnes: number;
    bonusSerie: number;
    serie: number;
    messageSerie: string | null;
  };
  bilan?: {
    bonnesReponses: number;
    total: number;
    pourcentage: number;
    meilleureSerie: number;
    reussi: boolean;
    seuil: number;
  };
  top5?: { id: string; rank: number; name: string; score: number }[];
}

interface LigneCorrection {
  numero: number;
  texte: string;
  options: QuestionOption[];
  maSelection: Letter[];
  bonnesReponses: Letter[];
  juste: boolean;
  aRepondu: boolean;
  points: number;
  explication: string | null;
}

const DUREE_REACTION_MS = 3000;
/** Même valeur que sur l'écran projeté : les deux restent synchronisés. */
const DUREE_AVANT_CLASSEMENT_MS = 4500;

export default function PageJeu() {
  const router = useRouter();
  const [session, setSession] = useState<SessionJoueur | null>(null);
  const [etat, setEtat] = useState<EtatJoueur | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [selection, setSelection] = useState<Letter[]>([]);
  const [envoi, setEnvoi] = useState(false);
  /**
   * La réponse que ce téléphone vient d'envoyer, affichée IMMÉDIATEMENT.
   * Sans cela, l'apprenant reste devant les boutons pendant tout l'aller-
   * retour vers le serveur (facile à vivre comme un plantage en 3G).
   * Si le serveur refuse, on rend la main et on affiche l'erreur.
   */
  const [envoye, setEnvoye] = useState<{ index: number; lettres: Letter[] } | null>(
    null,
  );
  const [restantMs, setRestantMs] = useState(0);
  const [reaction, setReaction] = useState<{
    type: Reaction;
    phrase: string;
    points: number;
    serie: string | null;
  } | null>(null);
  const [correction, setCorrection] = useState<LigneCorrection[] | null>(null);
  /** Pendant la correction : d'abord la réponse, puis le classement. */
  const [etapeReveal, setEtapeReveal] = useState<"reponse" | "classement">(
    "reponse",
  );

  const dernierePhase = useRef<string>("");
  const reactionFaitePour = useRef<number>(-1);
  const recuA = useRef<number>(0);

  // ---------------------------------------------------------------- session
  useEffect(() => {
    const trouvee = lireSession();
    if (!trouvee) {
      router.replace("/");
      return;
    }
    setSession(trouvee);
    // Le son a déjà été débloqué sur la page d'entrée. Mais si la page a été
    // rechargée (ou ouverte directement ici), le navigateur refuse encore le
    // son : on le débloquera au tout premier toucher de l'écran.
    audio().debloquer();
    audio().armerPremierGeste();
  }, [router]);

  // ------------------------------------------------------- lecture de l'état
  const rafraichir = useCallback(async () => {
    if (!session) return;
    try {
      const { ok, status, donnees } = await appelJoueur<EtatJoueur>(
        "/api/player/state",
        session,
      );
      if (!ok) {
        if (status === 401 || status === 403) {
          effacerSession();
          setErreur(donnees.erreur ?? "Votre place n'est plus valable.");
          return;
        }
        setErreur(donnees.erreur ?? "Impossible de contacter le quiz.");
        return;
      }
      setErreur(null);
      recuA.current = Date.now();
      setEtat(donnees);
      if (donnees.phase === "question") {
        setRestantMs(donnees.tempsRestantMs ?? 0);
      }
    } catch {
      setErreur("Connexion perdue. On réessaie…");
    }
  }, [session]);

  useEffect(() => {
    if (session) void rafraichir();
  }, [session, rafraichir]);

  // « 12 sur 20 ont répondu » change à chaque réponse de la classe. Ce
  // compteur arrive déjà dans le message temps réel : on le pose directement
  // dans l'état, sans redemander quoi que ce soit au serveur. Avec 30
  // téléphones, c'est la différence entre un quiz fluide et un quiz figé.
  const majCompteurs = useCallback((ligne: LignePartie) => {
    setEtat((precedent) =>
      precedent === null || precedent.ontRepondu === ligne.answered_count
        ? precedent
        : { ...precedent, ontRepondu: ligne.answered_count },
    );
  }, []);

  useRealtimeGame(session?.gameId ?? null, rafraichir, {
    secoursMs: 4000,
    surCompteurs: majCompteurs,
    // Le téléphone n'affiche jamais les scores des autres pendant le jeu :
    // s'abonner à la table des joueurs lui ferait recevoir une trentaine de
    // messages par question sans aucun usage.
    ecouterJoueurs: false,
  });

  // ------------------------------------------------- compte à rebours local
  useEffect(() => {
    if (!etat || etat.phase !== "question" || etat.enPause) return;
    const base = etat.tempsRestantMs ?? 0;
    const horloge = setInterval(() => {
      const restant = Math.max(0, base - (Date.now() - recuA.current));
      setRestantMs(restant);
      audio().definirTempsRestant(Math.ceil(restant / 1000));
    }, 200);
    return () => clearInterval(horloge);
  }, [etat]);

  // ------------------------------------------- musique selon le moment du jeu
  useEffect(() => {
    if (!etat) return;
    if (etat.phase === "lobby") audio().definirAmbiance("attente");
    else if (etat.phase === "question") audio().definirAmbiance("question");
    else if (etat.phase === "reveal") audio().definirAmbiance("revelation");
    else if (etat.phase === "finished") audio().definirAmbiance("finale");
  }, [etat?.phase]);

  // ------------------------- correction : la réponse, PUIS le classement
  useEffect(() => {
    if (etat?.phase !== "reveal") {
      setEtapeReveal("reponse");
      return;
    }
    setEtapeReveal("reponse");
    const bascule = setTimeout(
      () => setEtapeReveal("classement"),
      DUREE_AVANT_CLASSEMENT_MS,
    );
    return () => clearTimeout(bascule);
  }, [etat?.phase, etat?.index]);

  // --------------------------------------------- la réaction après la question
  useEffect(() => {
    if (!etat) return;

    // Nouvelle question : on remet la sélection à zéro.
    const cle = `${etat.phase}-${etat.index}`;
    if (etat.phase === "question" && dernierePhase.current !== cle) {
      setSelection(etat.maSelection ?? []);
      setEnvoye(null);
      setReaction(null);
    }
    dernierePhase.current = cle;

    if (etat.phase !== "reveal" || !etat.resultat) return;
    if (reactionFaitePour.current === etat.index) return;
    reactionFaitePour.current = etat.index;

    const resultat = etat.resultat;
    const type: Reaction = !resultat.aRepondu
      ? "tropLent"
      : resultat.juste
        ? "reussite"
        : etat.modeMoqueur
          ? "echecMoqueur"
          : "echecGentil";

    const phrase = phraseAuHasard(type);
    setReaction({
      type,
      phrase,
      points: resultat.pointsGagnes,
      serie: resultat.messageSerie,
    });

    const moteur = audio();
    if (type === "reussite") {
      moteur.bruitageVictoire();
      moteur.parler(pourLaVoix(phrase), "enjoue", 250);
    } else if (type === "tropLent") {
      moteur.bruitageTortue();
      moteur.parler(pourLaVoix(phrase), "neutre", 500);
    } else {
      // le rire d'abord, la phrase moqueuse juste après
      moteur.bruitageRire();
      moteur.parler(pourLaVoix(phrase), type === "echecMoqueur" ? "moqueur" : "neutre", 850);
    }
  }, [etat]);

  // La réaction dure 3 secondes. Ce minuteur est volontairement dans son
  // propre effet, déclenché par la réaction elle-même : s'il vivait dans
  // l'effet ci-dessus, le rafraîchissement de l'état toutes les 4 s le
  // remettrait à zéro et l'écran resterait bloqué sur l'emoji.
  useEffect(() => {
    if (!reaction) return;
    const minuteur = setTimeout(() => setReaction(null), DUREE_REACTION_MS);
    return () => clearTimeout(minuteur);
  }, [reaction]);

  // ------------------------------------------------------ envoi d'une réponse
  async function envoyer(lettres: Letter[]) {
    if (!session || !etat || envoi || lettres.length === 0) return;
    if (envoye?.index === etat.index) return; // déjà envoyé pour cette question

    // On bascule l'écran tout de suite : c'est le serveur qui fait foi,
    // mais l'apprenant ne doit pas attendre pour savoir que c'est parti.
    const index = etat.index;
    setEnvoye({ index, lettres });
    setErreur(null);
    setEnvoi(true);

    const { ok, donnees } = await appelJoueur("/api/player/answer", session, {
      letters: lettres,
    });
    setEnvoi(false);

    if (!ok) {
      setEnvoye(null); // on rend la main pour qu'il puisse réessayer
      setErreur(donnees.erreur ?? "Réponse non enregistrée. Réessayez.");
      return;
    }
    void rafraichir();
  }

  function basculer(lettre: Letter) {
    setSelection((avant) =>
      avant.includes(lettre)
        ? avant.filter((autre) => autre !== lettre)
        : [...avant, lettre],
    );
  }

  async function voirCorrection() {
    if (!session) return;
    const { ok, donnees } = await appelJoueur<{ correction: LigneCorrection[] }>(
      "/api/player/recap",
      session,
    );
    if (ok) setCorrection(donnees.correction);
  }

  // ========================================================== affichage
  if (erreur && !etat) {
    return (
      <Cadre>
        <p className="erreur">{erreur}</p>
        <button
          type="button"
          className="bouton"
          onClick={() => {
            effacerSession();
            router.replace("/");
          }}
        >
          Revenir à l'entrée
        </button>
      </Cadre>
    );
  }

  if (!etat) {
    return (
      <Cadre>
        <p style={{ textAlign: "center" }}>Connexion au quiz…</p>
      </Cadre>
    );
  }

  // ---------- Réaction plein écran (environ 3 secondes) ----------
  if (reaction) {
    // Un aplat de couleur plein écran : vert si c'est juste, rouge si
    // c'est faux, jaune si le temps est passé. Lisible d'un coup d'œil,
    // même à bout de bras.
    const fond =
      reaction.type === "reussite"
        ? "var(--color-vert)"
        : reaction.type === "tropLent"
          ? "var(--color-jaune)"
          : "var(--color-rouge)";

    // Sur le jaune, le texte blanc ne passerait pas.
    const encre = reaction.type === "tropLent" ? "#4a3600" : "#fff";

    return (
      <main
        style={{
          alignItems: "center",
          background: fond,
          color: encre,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          minHeight: "100dvh",
          padding: "1.5rem 1rem",
          textAlign: "center",
        }}
      >
        <Confettis actif={reaction.type === "reussite"} />
        <div
          className={reaction.type === "reussite" ? "anim-rebondit" : "anim-tremble"}
          style={{ fontSize: "clamp(5rem, 28vw, 10rem)", lineHeight: 1 }}
          aria-hidden
        >
          {EMOJIS[reaction.type]}
        </div>
        <h1
          className="anim-apparait texte-normal"
          style={{
            fontSize: "clamp(1.8rem, 9vw, 3rem)",
            fontWeight: 800,
            margin: "1rem 0 0.6rem",
          }}
        >
          {reaction.phrase}
        </h1>
        {reaction.points > 0 && (
          <p
            className="chiffre"
            style={{
              background: "rgba(255, 255, 255, 0.25)",
              borderRadius: 999,
              display: "inline-block",
              fontSize: "1.7rem",
              margin: "0.3rem 0",
              padding: "0.3rem 1.2rem",
            }}
          >
            +{reaction.points} points
          </p>
        )}
        {reaction.serie && (
          <p className="titre" style={{ fontSize: "1.3rem", margin: 0 }}>
            {reaction.serie}
          </p>
        )}
      </main>
    );
  }

  // ---------- Salle d'attente ----------
  if (etat.phase === "lobby") {
    return (
      <Cadre>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "3.4rem" }} aria-hidden>
            ✅
          </div>
          <h1 style={{ fontSize: "1.9rem", margin: "0.4rem 0" }}>
            Vous êtes dans le quiz !
          </h1>
          <p style={{ color: "var(--color-encre-doux)" }}>
            Bonjour <strong>{etat.nom}</strong>. Le quiz «&nbsp;{etat.quizTitre}
            &nbsp;» va commencer.
          </p>
          <div className="carte anim-pulse" style={{ marginTop: "1.2rem" }}>
            <div className="chiffre" style={{ fontSize: "2.6rem" }}>
              {etat.joueurs}
            </div>
            <div>{etat.joueurs > 1 ? "joueurs présents" : "joueur présent"}</div>
          </div>
          <p style={{ color: "var(--color-encre-doux)", marginTop: "1.2rem" }}>
            Gardez cet écran ouvert 📱
          </p>
        </div>
      </Cadre>
    );
  }

  // ---------- Fin de partie ----------
  if (etat.phase === "finished") {
    const bilan = etat.bilan;
    return (
      <Cadre>
        <Confettis actif={bilan?.reussi === true} duree={2200} />
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: "1.9rem", marginBottom: "0.2rem" }}>Quiz terminé !</h1>
          <p style={{ color: "var(--color-encre-doux)", marginTop: 0 }}>{etat.nom}</p>

          <div className="carte" style={{ marginTop: "1rem" }}>
            <div className="chiffre" style={{ fontSize: "3rem", lineHeight: 1 }}>
              {etat.score}
            </div>
            <div>points</div>
            <hr style={{ border: 0, borderTop: "1px solid #d7e3d2", margin: "1rem 0" }} />
            <div style={{ display: "flex", justifyContent: "space-around", flexWrap: "wrap", gap: "0.8rem" }}>
              <div>
                <div className="chiffre" style={{ fontSize: "1.6rem" }}>
                  {etat.rang}
                  <span style={{ fontSize: "1rem" }}>
                    {etat.rang === 1 ? "er" : "e"}
                  </span>
                </div>
                <div style={{ fontSize: "0.8rem" }}>sur {etat.joueurs}</div>
              </div>
              {bilan && (
                <>
                  <div>
                    <div className="chiffre" style={{ fontSize: "1.6rem" }}>
                      {bilan.bonnesReponses}/{bilan.total}
                    </div>
                    <div style={{ fontSize: "0.8rem" }}>bonnes réponses</div>
                  </div>
                  <div>
                    <div className="chiffre" style={{ fontSize: "1.6rem" }}>
                      {bilan.pourcentage.toString().replace(".", ",")} %
                    </div>
                    <div style={{ fontSize: "0.8rem" }}>de réussite</div>
                  </div>
                </>
              )}
            </div>
          </div>

          {bilan && (
            <p
              className="titre"
              style={{
                background: bilan.reussi ? "var(--color-succes)" : "var(--color-echec)",
                borderRadius: "0.9rem",
                color: "#fff",
                fontSize: "1.3rem",
                margin: "1rem 0",
                padding: "0.8rem",
              }}
            >
              {bilan.reussi
                ? `Réussi ! (seuil : ${bilan.seuil} %)`
                : `À retravailler (seuil : ${bilan.seuil} %)`}
            </p>
          )}

          {!correction ? (
            <button type="button" className="bouton" onClick={voirCorrection}>
              Voir la correction
            </button>
          ) : (
            <div style={{ marginTop: "1rem", textAlign: "left" }}>
              <h2 style={{ fontSize: "1.3rem" }}>Correction</h2>
              <div className="liste-correction">
              {correction.map((ligne) => (
                <div
                  key={ligne.numero}
                  className="carte"
                  style={{
                    borderLeft: `5px solid ${ligne.juste ? "var(--color-succes)" : "var(--color-echec)"}`,
                    marginBottom: "0.8rem",
                  }}
                >
                  <div style={{ fontSize: "0.8rem", color: "var(--color-encre-doux)" }}>
                    Question {ligne.numero} · {ligne.juste ? "✅ juste" : "❌ faux"} ·{" "}
                    {ligne.points} pts
                  </div>
                  <p style={{ fontWeight: 600, margin: "0.4rem 0" }}>{ligne.texte}</p>
                  <p style={{ margin: "0.2rem 0", fontSize: "0.92rem" }}>
                    Votre réponse :{" "}
                    <strong>
                      {ligne.aRepondu ? ligne.maSelection.join(", ") : "pas de réponse"}
                    </strong>
                  </p>
                  <p style={{ margin: "0.2rem 0", fontSize: "0.92rem" }}>
                    Bonne réponse : <strong>{ligne.bonnesReponses.join(", ")}</strong>{" "}
                    —{" "}
                    {ligne.options
                      .filter((option) => ligne.bonnesReponses.includes(option.letter))
                      .map((option) => option.text)
                      .join(" / ")}
                  </p>
                  {ligne.explication && (
                    <p
                      style={{
                        background: "var(--color-fond-doux)",
                        borderRadius: "0.6rem",
                        fontSize: "0.9rem",
                        margin: "0.6rem 0 0",
                        padding: "0.6rem 0.8rem",
                      }}
                    >
                      💡 {ligne.explication}
                    </p>
                  )}
                </div>
              ))}
              </div>
            </div>
          )}
        </div>
      </Cadre>
    );
  }

  // ---------- Classement plein écran (le classement n'est JAMAIS affiché
  //            en même temps que la question : c'est son propre écran) ----
  if (etat.phase === "reveal" && etapeReveal === "classement") {
    const dansLeTop = (etat.top5 ?? []).some(
      (joueur) => joueur.id === session?.playerId,
    );
    // Si l'apprenant n'est pas dans les premiers, on ajoute sa ligne pour
    // qu'il se situe quand même.
    const lignes = [
      ...(etat.top5 ?? []),
      ...(dansLeTop || !session
        ? []
        : [
            {
              id: session.playerId,
              rank: etat.rang,
              name: etat.nom,
              score: etat.score,
            },
          ]),
    ];

    return (
      <ClassementPlein
        joueurs={lignes}
        moiId={session?.playerId}
        sousTitre={`Après la question ${etat.index + 1} sur ${etat.questionCount}`}
      />
    );
  }

  // ---------- Entre deux questions : la correction affichée ----------
  if (etat.phase === "reveal") {
    const resultat = etat.resultat;
    return (
      <Cadre>
        <div style={{ textAlign: "center" }}>
          <p className="etiquette">
            Question {etat.index + 1} / {etat.questionCount}
          </p>
          <h1
            className="question-texte"
            style={{ margin: "0.8rem 0" }}
          >
            {etat.question?.text}
          </h1>

          <div className="grille-reponses" style={{ textAlign: "left" }}>
            {(etat.question?.options ?? []).map((option) => (
              <BoutonReponse
                key={option.letter}
                letter={option.letter}
                text={option.text}
                estime={
                  resultat?.bonnesReponses.includes(option.letter)
                    ? "bonne"
                    : resultat?.maSelection.includes(option.letter)
                      ? "mauvaise"
                      : null
                }
              />
            ))}
          </div>

          {resultat?.explication && (
            <p
              className="carte"
              style={{ fontSize: "0.95rem", marginTop: "1rem", textAlign: "left" }}
            >
              💡 {resultat.explication}
            </p>
          )}

          <div className="carte" style={{ marginTop: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-around" }}>
              <div>
                <div className="chiffre" style={{ fontSize: "1.8rem" }}>
                  {etat.score}
                </div>
                <div style={{ fontSize: "0.8rem" }}>points</div>
              </div>
              <div>
                <div className="chiffre" style={{ fontSize: "1.8rem" }}>
                  {etat.rang}
                  <span style={{ fontSize: "0.9rem" }}>
                    {etat.rang === 1 ? "er" : "e"}
                  </span>
                </div>
                <div style={{ fontSize: "0.8rem" }}>sur {etat.joueurs}</div>
              </div>
            </div>
          </div>

          <p style={{ color: "var(--color-encre-doux)", marginTop: "1rem" }}>
            Question suivante dans un instant…
          </p>
        </div>
      </Cadre>
    );
  }

  // ---------- Question en cours ----------
  const question = etat.question;
  const multiple = question?.multiple === true;
  const envoiLocal = envoye?.index === etat.index ? envoye.lettres : null;
  const dejaRepondu = etat.aRepondu === true || envoiLocal !== null;
  const mesLettres = envoiLocal ?? etat.maSelection ?? [];
  const duree = question?.durationSeconds ?? 0;

  return (
    <Cadre>
      <div
        style={{
          alignItems: "center",
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "0.8rem",
        }}
      >
        <div>
          <p className="etiquette" style={{ marginBottom: 4 }}>
            Question {etat.index + 1} / {etat.questionCount}
          </p>
          <div style={{ fontSize: "0.85rem", color: "var(--color-encre-doux)" }}>
            {etat.score} pts · {etat.rang}
            {etat.rang === 1 ? "er" : "e"} sur {etat.joueurs}
          </div>
        </div>
        <div className="chrono-joueur">
          <Chrono
            secondesRestantes={restantMs / 1000}
            dureeTotale={duree}
            taille={84}
          />
        </div>
      </div>

      {etat.enPause && (
        <p className="carte anim-pulse" style={{ textAlign: "center" }}>
          ⏸️ Le formateur a mis le quiz en pause.
        </p>
      )}

      <h1
        className="question-texte"
        style={{ margin: "0.4rem 0 1rem" }}
      >
        {question?.text}
      </h1>

      {multiple && !dejaRepondu && (
        <p
          className="etiquette"
          style={{ display: "block", marginBottom: "0.7rem", textAlign: "center" }}
        >
          Plusieurs bonnes réponses : sélectionnez puis validez
        </p>
      )}

      {dejaRepondu ? (
        <div className="carte" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "2.6rem" }} aria-hidden>
            📨
          </div>
          <p className="titre" style={{ fontSize: "1.2rem", margin: "0.3rem 0" }}>
            Réponse enregistrée !
          </p>
          <p style={{ color: "var(--color-encre-doux)", margin: 0 }}>
            Vous avez choisi {mesLettres.join(", ")}. On attend les autres…
          </p>
          <p style={{ marginTop: "0.8rem", marginBottom: 0 }}>
            <strong>{etat.ontRepondu ?? 0}</strong> / {etat.joueurs} ont répondu
          </p>
        </div>
      ) : (
        <>
          <div className="grille-reponses">
            {(question?.options ?? []).map((option) => (
              <BoutonReponse
                key={option.letter}
                letter={option.letter}
                text={option.text}
                choisi={
                  multiple
                    ? selection.length === 0
                      ? null
                      : selection.includes(option.letter)
                    : null
                }
                desactive={envoi || etat.enPause === true}
                onClick={() =>
                  multiple ? basculer(option.letter) : void envoyer([option.letter])
                }
              />
            ))}
          </div>

          {/* Ce bouton n'existe QUE pour les questions à plusieurs bonnes
              réponses : sans lui, le premier appui enverrait une seule
              lettre. Il n'apparaît qu'une fois une réponse cochée, et
              reste collé en bas de l'écran pour être sous le pouce. */}
          {multiple && selection.length > 0 && (
            <button
              type="button"
              className="bouton anim-apparait"
              style={{
                bottom: "clamp(0.6rem, 2.5vh, 1.2rem)",
                boxShadow: "0 6px 0 var(--color-vert-fonce), 0 10px 24px rgba(35, 49, 61, 0.25)",
                left: "50%",
                maxWidth: 520,
                position: "sticky",
                transform: "translateX(-50%)",
                width: "calc(100% - 2rem)",
                zIndex: 4,
              }}
              disabled={envoi || etat.enPause === true}
              onClick={() => void envoyer(selection)}
            >
              {envoi
                ? "Envoi…"
                : `Valider mes ${selection.length} réponse${selection.length > 1 ? "s" : ""}`}
            </button>
          )}
        </>
      )}

      {erreur && (
        <p className="erreur" style={{ marginTop: "1rem" }} role="alert">
          {erreur}
        </p>
      )}
    </Cadre>
  );
}

/** Une ligne du classement. Celle de l'apprenant est mise en évidence. */
function LigneClassement({
  rang,
  nom,
  score,
  moi,
}: {
  rang: number;
  nom: string;
  score: number;
  moi?: boolean;
}) {
  return (
    <li
      style={{
        alignItems: "center",
        background: moi ? "rgba(37, 229, 255, 0.14)" : "transparent",
        border: moi ? "1px solid var(--color-vert)" : "1px solid transparent",
        borderRadius: "0.4rem",
        display: "flex",
        gap: "0.6rem",
        marginBottom: "0.25rem",
        padding: "0.45rem 0.6rem",
      }}
    >
      <span
        className="chiffre"
        style={{
          color: rang <= 3 ? "var(--color-reponse-c)" : "var(--color-encre-doux)",
          flex: "0 0 1.6rem",
          fontSize: "1rem",
        }}
      >
        {rang}
      </span>
      <span
        style={{
          flex: 1,
          fontWeight: moi ? 700 : 400,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {nom}
        {moi && " (vous)"}
      </span>
      <span style={{ fontFamily: "var(--font-texte)", fontWeight: 800 }}>
        {score}
      </span>
    </li>
  );
}

function Cadre({ children }: { children: React.ReactNode }) {
  return (
    <main className="ecran-joueur">{children}</main>
  );
}
