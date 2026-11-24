import { describe, it } from "node:test";
import { expect } from "./verifier.ts";
import {
  computePoints,
  hasPassed,
  isAnswerCorrect,
  LATE_TOLERANCE_MS,
  normalizeSelection,
  scoreAnswer,
  STREAK_BONUS,
} from "../lib/scoring.ts";

describe("bonne ou mauvaise réponse", () => {
  it("accepte la bonne lettre", () => {
    expect(isAnswerCorrect(["B"], ["B"])).toBe(true);
  });

  it("refuse la mauvaise lettre", () => {
    expect(isAnswerCorrect(["A"], ["B"])).toBe(false);
  });

  it("refuse l'absence de réponse", () => {
    expect(isAnswerCorrect([], ["B"])).toBe(false);
  });

  it("exige l'ensemble exact quand il y a plusieurs bonnes réponses", () => {
    expect(isAnswerCorrect(["A", "B"], ["A", "B"])).toBe(true);
    expect(isAnswerCorrect(["B", "A"], ["A", "B"])).toBe(true);
    // une seule des deux : faux
    expect(isAnswerCorrect(["A"], ["A", "B"])).toBe(false);
    // une de trop : faux
    expect(isAnswerCorrect(["A", "B", "C"], ["A", "B"])).toBe(false);
  });

  it("ne tient pas compte de la casse", () => {
    expect(isAnswerCorrect(["b"], ["B"])).toBe(true);
  });
});

describe("points de rapidité", () => {
  it("donne 1000 points pour une réponse instantanée", () => {
    expect(computePoints(0, 60)).toBe(1000);
  });

  it("donne 500 points pour une réponse à la dernière seconde", () => {
    expect(computePoints(60_000, 60)).toBe(500);
  });

  it("donne 750 points à la moitié du temps", () => {
    expect(computePoints(30_000, 60)).toBe(750);
  });

  it("ne descend jamais sous 500 ni ne dépasse 1000", () => {
    for (const elapsed of [-5000, 0, 1, 30_000, 59_999, 60_000, 120_000]) {
      const points = computePoints(elapsed, 60);
      expect(points).toBeGreaterThanOrEqual(500);
      expect(points).toBeLessThanOrEqual(1000);
    }
  });
});

describe("notation d'une réponse", () => {
  const base = { correct: ["B"], durationSeconds: 60, previousStreak: 0 };

  it("0 point pour une mauvaise réponse, et la série repart de zéro", () => {
    const result = scoreAnswer({ ...base, selected: ["A"], elapsedMs: 1000, previousStreak: 5 });
    expect(result.isCorrect).toBe(false);
    expect(result.total).toBe(0);
    expect(result.newStreak).toBe(0);
    expect(result.streakMessage).toBeNull();
  });

  it("0 point quand le joueur n'a pas répondu", () => {
    const result = scoreAnswer({
      ...base,
      selected: [],
      elapsedMs: 60_000,
      timedOut: true,
    });
    expect(result.isCorrect).toBe(false);
    expect(result.total).toBe(0);
    expect(result.tooLate).toBe(true);
  });

  it("refuse une réponse arrivée bien après la fin du temps", () => {
    const result = scoreAnswer({ ...base, selected: ["B"], elapsedMs: 65_000 });
    expect(result.isCorrect).toBe(false);
    expect(result.tooLate).toBe(true);
  });

  it("tolère le petit retard du réseau", () => {
    const result = scoreAnswer({
      ...base,
      selected: ["B"],
      elapsedMs: 60_000 + LATE_TOLERANCE_MS - 1,
    });
    expect(result.isCorrect).toBe(true);
    expect(result.points).toBe(500);
  });
});

describe("bonus de série", () => {
  const base = { correct: ["B"], selected: ["B"], durationSeconds: 60, elapsedMs: 0 };

  it("pas de bonus sur les deux premières bonnes réponses", () => {
    expect(scoreAnswer({ ...base, previousStreak: 0 }).streakBonus).toBe(0);
    expect(scoreAnswer({ ...base, previousStreak: 1 }).streakBonus).toBe(0);
  });

  it("+100 à partir de la 3e bonne réponse de suite", () => {
    const result = scoreAnswer({ ...base, previousStreak: 2 });
    expect(result.newStreak).toBe(3);
    expect(result.streakBonus).toBe(STREAK_BONUS);
    expect(result.total).toBe(result.points + STREAK_BONUS);
    expect(result.streakMessage).toBe("🔥 Série de 3 !");
  });

  it("garde le bonus sur les bonnes réponses suivantes", () => {
    const result = scoreAnswer({ ...base, previousStreak: 6 });
    expect(result.newStreak).toBe(7);
    expect(result.streakBonus).toBe(STREAK_BONUS);
    expect(result.streakMessage).toBe("🔥 Série de 7 !");
  });

  it("une mauvaise réponse casse la série", () => {
    const casse = scoreAnswer({
      ...base,
      selected: ["A"],
      previousStreak: 9,
    });
    expect(casse.newStreak).toBe(0);
    // la bonne réponse suivante repart donc à 1, sans bonus
    const apres = scoreAnswer({ ...base, previousStreak: casse.newStreak });
    expect(apres.newStreak).toBe(1);
    expect(apres.streakBonus).toBe(0);
  });

  it("enchaîne correctement une partie entière", () => {
    const resultats = ["B", "B", "B", "A", "B", "B", "B", "B"];
    let serie = 0;
    let score = 0;
    const bonus: number[] = [];
    for (const choix of resultats) {
      const result = scoreAnswer({ ...base, selected: [choix], previousStreak: serie });
      serie = result.newStreak;
      score += result.total;
      bonus.push(result.streakBonus);
    }
    // bonus à la 3e, rien à la 4e (fausse) et 5e et 6e, puis 7e et 8e
    expect(bonus).toEqual([0, 0, 100, 0, 0, 0, 100, 100]);
    expect(score).toBe(7 * 1000 + 300);
  });
});

describe("lettres reçues du téléphone", () => {
  it("nettoie, met en majuscules et retire les doublons", () => {
    expect(normalizeSelection([" b ", "b", "a"])).toEqual(["B", "A"]);
  });

  it("ignore tout ce qui n'est pas A, B, C ou D", () => {
    expect(normalizeSelection(["E", "1", "", null, 7, "C"])).toEqual(["C"]);
  });

  it("refuse ce qui n'est pas une liste", () => {
    expect(normalizeSelection("B")).toEqual([]);
    expect(normalizeSelection(undefined)).toEqual([]);
  });
});

describe("seuil de réussite", () => {
  it("compare le pourcentage de bonnes réponses au seuil", () => {
    expect(hasPassed(22, 30, 72)).toBe(true); // 73,3 %
    expect(hasPassed(21, 30, 72)).toBe(false); // 70 %
    expect(hasPassed(30, 30, 72)).toBe(true);
    expect(hasPassed(0, 30, 72)).toBe(false);
  });

  it("gère le cas limite d'un quiz sans question", () => {
    expect(hasPassed(0, 0, 72)).toBe(false);
  });
});
