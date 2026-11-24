/**
 * Musique d'ambiance, bruitages et voix — tout est fabriqué dans le
 * navigateur avec la Web Audio API et la synthèse vocale. Aucun fichier
 * son, aucun téléchargement, aucune question de droits d'auteur.
 *
 * La musique reste volontairement discrète (environ 18 %) : elle anime la
 * salle sans couvrir la voix du formateur ni les bruitages.
 */

export type Ambiance = "silence" | "attente" | "question" | "revelation" | "finale";
export type TonVoix = "enjoue" | "moqueur" | "neutre";

// Ces valeurs sont les gains des BUS. Les notes, elles, sont jouees proche
// de 1 : sinon l'attenuation s'applique deux fois et le son devient
// inaudible sur un haut-parleur de telephone (c'etait le cas : 0,18 x 0,25
// = 0,045, soit -27 dB).
//
// Valeurs CALEES A LA MESURE (amplitude crete relevee en sortie, via un
// analyseur branche sur la destination) :
//   musique    ~0,20  -> les 15-20 % demandes, presente sans gener
//   bruitages  ~0,65  -> environ 10 dB au-dessus : ils passent par-dessus
// Ne les changez pas « au jugé » : remesurez avec /formateur/son.
const VOLUME_MUSIQUE = 0.09;
const VOLUME_MUSIQUE_BAISSEE = 0.03;
const VOLUME_BRUITAGES = 0.9;

/** Un pas de séquenceur toutes les 125 ms : assez fin pour un tic-tac. */
const PAS_MS = 125;

/** Notes en hertz, gamme pentatonique : impossible de faire faux. */
const NOTE = {
  do3: 130.81,
  sol3: 196.0,
  do4: 261.63,
  re4: 293.66,
  mi4: 329.63,
  sol4: 392.0,
  la4: 440.0,
  do5: 523.25,
  re5: 587.33,
  mi5: 659.25,
  sol5: 783.99,
  la5: 880.0,
  do6: 1046.5,
};

/** Mélodies jouées en boucle, une note par pas utilisé. */
const MELODIES: Record<"attente" | "question" | "finale", (number | null)[]> = {
  // Calme et joyeux : une note toutes les 500 ms.
  attente: [
    NOTE.do5, null, null, null,
    NOTE.mi5, null, null, null,
    NOTE.sol5, null, null, null,
    NOTE.mi5, null, null, null,
    NOTE.la4, null, null, null,
    NOTE.do5, null, null, null,
    NOTE.mi5, null, null, null,
    NOTE.do5, null, null, null,
  ],
  // Plus rythmé : une note toutes les 250 ms.
  question: [
    NOTE.do5, null, NOTE.mi5, null,
    NOTE.sol5, null, NOTE.mi5, null,
    NOTE.la4, null, NOTE.do5, null,
    NOTE.mi5, null, NOTE.do5, null,
    NOTE.re5, null, NOTE.sol4, null,
    NOTE.re5, null, NOTE.mi5, null,
    NOTE.do5, null, NOTE.la4, null,
    NOTE.sol4, null, null, null,
  ],
  // Petite fanfare pour le podium.
  finale: [
    NOTE.do5, null, NOTE.mi5, null,
    NOTE.sol5, null, null, null,
    NOTE.do6, null, null, null,
    NOTE.sol5, null, NOTE.do6, null,
  ],
};

export class MoteurAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musique: GainNode | null = null;
  private bruitages: GainNode | null = null;

  private boucle: ReturnType<typeof setInterval> | null = null;
  private pas = 0;
  private ambiance: Ambiance = "silence";
  private secondesRestantes = 999;
  private voix: SpeechSynthesisVoice | null = null;
  private voixCherchee = false;
  private gesteArme = false;
  private voixReveillee = false;

  get actif(): boolean {
    return this.ctx !== null;
  }

  /**
   * À appeler au PREMIER TOUCHER de l'écran (« Entrer dans le quiz »,
   * « Créer une partie »). Les navigateurs de téléphone refusent tout son
   * avant une action de l'utilisateur : c'est ce geste qui débloque tout.
   */
  debloquer(): void {
    if (typeof window === "undefined") return;

    if (!this.ctx) {
      const Constructeur =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Constructeur) return;

      this.ctx = new Constructeur();
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;

      // Un compresseur en sortie : plusieurs notes peuvent se superposer
      // (musique + bruitage + tic-tac) et saturer. Il arrondit les pointes
      // au lieu de les laisser craquer dans le haut-parleur.
      const compresseur = this.ctx.createDynamicsCompressor();
      compresseur.threshold.value = -14;
      compresseur.knee.value = 12;
      compresseur.ratio.value = 6;
      compresseur.attack.value = 0.003;
      compresseur.release.value = 0.2;

      this.master.connect(compresseur).connect(this.ctx.destination);

      this.musique = this.ctx.createGain();
      this.musique.gain.value = VOLUME_MUSIQUE;
      this.musique.connect(this.master);

      this.bruitages = this.ctx.createGain();
      this.bruitages.gain.value = VOLUME_BRUITAGES;
      this.bruitages.connect(this.master);
    }

    void this.ctx.resume();
    this.chercherVoix();

    // Réveille aussi la synthèse vocale, bloquée elle aussi avant un geste.
    // UNE SEULE FOIS : debloquer() peut être rappelé à chaque toucher, et
    // une file d'énoncés vides retarderait la vraie phrase.
    if (!this.voixReveillee && "speechSynthesis" in window) {
      this.voixReveillee = true;
      try {
        const vide = new SpeechSynthesisUtterance(" ");
        vide.volume = 0;
        window.speechSynthesis.speak(vide);
      } catch {
        /* sans importance */
      }
    }

    if (!this.boucle) {
      this.boucle = setInterval(() => this.unPas(), PAS_MS);
    }
  }

  /**
   * Filet de sécurité : si la page est rechargée (ou ouverte directement
   * sur /jouer, ou rouverte depuis l'historique), aucun clic n'a encore eu
   * lieu et le navigateur refuse tout son. On attend alors le tout premier
   * toucher de l'écran, où qu'il soit, pour tout débloquer.
   */
  armerPremierGeste(): void {
    if (typeof window === "undefined" || this.gesteArme) return;
    this.gesteArme = true;

    const reveiller = () => {
      this.debloquer();
      if (this.ctx && this.ctx.state === "running") {
        window.removeEventListener("pointerdown", reveiller);
        window.removeEventListener("keydown", reveiller);
        window.removeEventListener("touchstart", reveiller);
      }
    };

    window.addEventListener("pointerdown", reveiller);
    window.addEventListener("keydown", reveiller);
    window.addEventListener("touchstart", reveiller);
  }

  /** Pour la page de test du son : dit ce que le navigateur permet. */
  diagnostic(): {
    contexte: boolean;
    etat: string;
    voix: string | null;
    voixDisponibles: number;
  } {
    const toutes =
      typeof window !== "undefined" && "speechSynthesis" in window
        ? window.speechSynthesis.getVoices()
        : [];
    const francaises = toutes.filter((v) => v.lang?.toLowerCase().startsWith("fr"));

    // Avant le premier clic, aucune voix n'est encore retenue : on annonce
    // alors celle qui SERA choisie, sinon la page se contredirait
    // (« aucune trouvée — 3 disponibles »).
    const retenue =
      this.voix ?? francaises.find((v) => v.lang === "fr-FR") ?? francaises[0] ?? null;

    return {
      contexte: this.ctx !== null,
      etat: this.ctx?.state ?? "pas encore créé",
      voix: retenue ? `${retenue.name} (${retenue.lang})` : null,
      voixDisponibles: francaises.length,
    };
  }

  // ----------------------------------------------------------------- musique

  definirAmbiance(ambiance: Ambiance): void {
    if (this.ambiance === ambiance) return;
    this.ambiance = ambiance;
    this.pas = 0;
    if (this.musique && this.ctx) {
      const cible =
        ambiance === "revelation" ? VOLUME_MUSIQUE_BAISSEE : VOLUME_MUSIQUE;
      this.rampe(this.musique, cible, 0.3);
    }
  }

  /** Permet au tic-tac de s'accélérer dans les 10 dernières secondes. */
  definirTempsRestant(secondes: number): void {
    this.secondesRestantes = secondes;
  }

  /** Baisse la musique pendant la voix, puis la remonte. */
  baisserMusique(): void {
    if (this.musique) this.rampe(this.musique, VOLUME_MUSIQUE_BAISSEE, 0.15);
  }

  remonterMusique(): void {
    if (this.musique && this.ambiance !== "revelation") {
      this.rampe(this.musique, VOLUME_MUSIQUE, 0.4);
    }
  }

  arreter(): void {
    if (this.boucle) {
      clearInterval(this.boucle);
      this.boucle = null;
    }
    this.ambiance = "silence";
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.musique = null;
    this.bruitages = null;
  }

  private unPas(): void {
    if (!this.ctx || this.ctx.state !== "running") return;

    const ambiance = this.ambiance;
    if (ambiance === "silence" || ambiance === "revelation") {
      this.pas += 1;
      return;
    }

    const melodie = MELODIES[ambiance];
    const note = melodie[this.pas % melodie.length];

    if (note !== null) {
      const douce = ambiance === "attente";
      this.note(note, douce ? 0.42 : 0.22, "triangle", douce ? 0.8 : 0.9);
    }

    // Basse légère sur les temps forts : donne l'assise rythmique.
    if (this.pas % (ambiance === "attente" ? 16 : 8) === 0) {
      this.note(ambiance === "attente" ? NOTE.do3 : NOTE.sol3, 0.3, "sine", 0.85);
    }

    // Tic-tac pendant une question, qui s'accélère vers la fin.
    if (ambiance === "question") {
      const periode =
        this.secondesRestantes <= 5 ? 2 : this.secondesRestantes <= 10 ? 4 : 8;
      if (this.pas % periode === 0) {
        this.tic(this.secondesRestantes <= 10);
      }
    }

    this.pas += 1;
  }

  // --------------------------------------------------------------- bruitages

  /** Arpège montant : « tu as trouvé ! » */
  bruitageVictoire(): void {
    const suite = [NOTE.do5, NOTE.mi5, NOTE.sol5, NOTE.do6];
    suite.forEach((frequence, index) => {
      this.note(frequence, 0.16, "square", 0.55, index * 0.09, "bruitages");
    });
    this.note(NOTE.sol5, 0.5, "triangle", 0.5, 0.36, "bruitages");
  }

  /** Une cascade de petits glissandos : le rire. */
  bruitageRire(): void {
    if (!this.ctx || !this.bruitages) return;
    const debut = this.ctx.currentTime;
    for (let i = 0; i < 5; i += 1) {
      const t = debut + i * 0.13;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(420 - i * 28, t);
      osc.frequency.exponentialRampToValueAtTime(250 - i * 18, t + 0.11);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.6, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      osc.connect(gain).connect(this.bruitages);
      osc.start(t);
      osc.stop(t + 0.13);
    }
  }

  /** Deux notes graves qui descendent : la tortue. */
  bruitageTortue(): void {
    this.note(196, 0.34, "sine", 0.75, 0, "bruitages");
    this.note(146.83, 0.5, "sine", 0.75, 0.22, "bruitages");
  }

  /** Fanfare du podium. */
  fanfare(): void {
    const suite: [number, number][] = [
      [NOTE.do5, 0],
      [NOTE.do5, 0.14],
      [NOTE.mi5, 0.28],
      [NOTE.sol5, 0.42],
      [NOTE.do6, 0.6],
      [NOTE.sol5, 0.85],
      [NOTE.do6, 1.0],
    ];
    for (const [frequence, retard] of suite) {
      this.note(frequence, 0.22, "square", 0.6, retard, "bruitages");
    }
  }

  // -------------------------------------------------------------------- voix

  private chercherVoix(): void {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const choisir = (): boolean => {
      const toutes = window.speechSynthesis.getVoices();
      const trouvee =
        toutes.find((v) => v.lang === "fr-FR") ??
        toutes.find((v) => v.lang?.toLowerCase().startsWith("fr")) ??
        null;
      if (trouvee) this.voix = trouvee;
      this.voixCherchee = true;
      return Boolean(trouvee);
    };

    if (choisir()) return;

    // Sur la plupart des téléphones, la liste des voix arrive APRÈS le
    // premier appel : sans cet écouteur, on resterait muet pour toujours.
    window.speechSynthesis.addEventListener("voiceschanged", () => choisir(), {
      once: true,
    });
  }

  /**
   * Dit la phrase à voix haute, en français.
   * S'il n'y a aucune voix française sur le téléphone, on ne dit rien :
   * le texte affiché et le bruitage suffisent.
   */
  parler(texte: string, ton: TonVoix = "neutre", apresMs = 0): void {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (texte.trim() === "") return;

    if (!this.voixCherchee) this.chercherVoix();

    const dire = () => {
      if (!this.voix) return; // pas de voix française : on s'abstient
      const phrase = new SpeechSynthesisUtterance(texte);
      phrase.voice = this.voix;
      phrase.lang = this.voix.lang;
      phrase.volume = 1;

      if (ton === "enjoue") {
        phrase.rate = 1.15;
        phrase.pitch = 1.35;
      } else if (ton === "moqueur") {
        phrase.rate = 0.92;
        phrase.pitch = 1.55;
      } else {
        phrase.rate = 1;
        phrase.pitch = 1;
      }

      this.baisserMusique();
      phrase.onend = () => this.remonterMusique();
      phrase.onerror = () => this.remonterMusique();

      try {
        window.speechSynthesis.speak(phrase);
      } catch {
        this.remonterMusique();
      }
    };

    if (apresMs > 0) window.setTimeout(dire, apresMs);
    else dire();
  }

  // ------------------------------------------------------------------ outils

  private note(
    frequence: number,
    duree: number,
    forme: OscillatorType,
    volume: number,
    retard = 0,
    canal: "musique" | "bruitages" = "musique",
  ): void {
    if (!this.ctx) return;
    const sortie = canal === "bruitages" ? this.bruitages : this.musique;
    if (!sortie) return;

    const t = this.ctx.currentTime + retard;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = forme;
    osc.frequency.setValueAtTime(frequence, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duree);
    osc.connect(gain).connect(sortie);
    osc.start(t);
    osc.stop(t + duree + 0.02);
  }

  private tic(presse: boolean): void {
    if (!this.ctx || !this.musique) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(presse ? 1400 : 1100, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(presse ? 0.55 : 0.32, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    osc.connect(gain).connect(this.musique);
    osc.start(t);
    osc.stop(t + 0.06);
  }

  private rampe(noeud: GainNode, cible: number, duree: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    noeud.gain.cancelScheduledValues(t);
    noeud.gain.setValueAtTime(Math.max(noeud.gain.value, 0.0001), t);
    noeud.gain.linearRampToValueAtTime(cible, t + duree);
  }
}

/** Un seul moteur pour toute la page. */
let moteur: MoteurAudio | null = null;

export function audio(): MoteurAudio {
  if (!moteur) moteur = new MoteurAudio();
  return moteur;
}
