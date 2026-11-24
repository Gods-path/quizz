import { describe, it } from "node:test";
import { expect } from "./verifier.ts";
import {
  allocateDurations,
  computeQuizDurations,
  DurationError,
  isLongQuestion,
  MIN_QUESTION_SECONDS,
  questionWeight,
  snapDuration,
  STEP_SECONDS,
} from "../lib/durations.ts";
import type { ParsedQuestion } from "../lib/types.ts";

function makeQuestion(
  overrides: Partial<ParsedQuestion> & { textLength?: number } = {},
): ParsedQuestion {
  const textLength = overrides.textLength ?? 40;
  return {
    line: 2,
    theme: null,
    domaine: null,
    text: "Q".repeat(textLength),
    options: [
      { letter: "A", text: "a" },
      { letter: "B", text: "b" },
    ],
    correctLetters: ["A"],
    fileDurationSeconds: null,
    explanation: null,
    ...overrides,
  };
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe("poids d'une question", () => {
  it("compte double une question longue (plus de 120 caractères)", () => {
    const longue = makeQuestion({ textLength: 200 });
    expect(isLongQuestion(longue)).toBe(true);
    expect(questionWeight(longue)).toBe(2);
  });

  it("compte simple une question courte à une seule bonne réponse", () => {
    const courte = makeQuestion({ textLength: 30 });
    expect(questionWeight(courte)).toBe(1);
  });

  it("compte la longueur des réponses, pas seulement celle de la question", () => {
    const question = makeQuestion({
      textLength: 60,
      options: [
        { letter: "A", text: "x".repeat(50) },
        { letter: "B", text: "y".repeat(50) },
      ],
    });
    expect(isLongQuestion(question)).toBe(true);
  });

  it("compte double une question à plusieurs bonnes réponses, même courte", () => {
    const multiple = makeQuestion({ textLength: 20, correctLetters: ["A", "B"] });
    expect(isLongQuestion(multiple)).toBe(false);
    expect(questionWeight(multiple)).toBe(2);
  });
});

describe("répartition du temps", () => {
  it("donne plus de temps aux questions lourdes", () => {
    const durees = allocateDurations([1, 2], 10 * 60);
    expect(sum(durees)).toBe(600);
    expect(durees[1]).toBeGreaterThan(durees[0]);
  });

  it("tombe exactement sur la durée demandée", () => {
    const durees = allocateDurations(new Array(30).fill(2), 45 * 60);
    expect(sum(durees)).toBe(2700);
  });

  it("ne crée pas de question anormalement longue", () => {
    // 26 questions lourdes + 4 légères, le cas réel du module 01.
    const poids = [...new Array(26).fill(2), ...new Array(4).fill(1)];
    const durees = allocateDurations(poids, 45 * 60);
    expect(sum(durees)).toBe(2700);
    const lourdes = durees.slice(0, 26);
    expect(Math.max(...lourdes) - Math.min(...lourdes)).toBeLessThanOrEqual(
      STEP_SECONDS,
    );
  });

  // C'est la propriété qui compte vraiment : le total doit tomber juste,
  // QUEL QUE SOIT le nombre de questions et la durée choisie.
  it("tombe juste pour toutes les combinaisons de 1 à 200 questions", () => {
    for (let count = 1; count <= 200; count += 1) {
      for (const minutes of [5, 10, 17, 30, 45, 60, 90, 180]) {
        const totalSeconds = minutes * 60;
        const poids = Array.from({ length: count }, (_, i) =>
          i % 3 === 0 ? 1 : 2,
        );
        if (totalSeconds < count * MIN_QUESTION_SECONDS) {
          expect(() => allocateDurations(poids, totalSeconds)).toThrow(
            DurationError,
          );
          continue;
        }
        const durees = allocateDurations(poids, totalSeconds);
        expect(durees).toHaveLength(count);
        expect(sum(durees)).toBe(totalSeconds);
        for (const duree of durees) {
          expect(duree % STEP_SECONDS).toBe(0);
          expect(duree).toBeGreaterThanOrEqual(MIN_QUESTION_SECONDS);
        }
      }
    }
  });

  it("refuse une durée trop courte avec un message clair en français", () => {
    expect(() => allocateDurations(new Array(30).fill(1), 5 * 60)).toThrow(
      /Durée trop courte/,
    );
    expect(() => allocateDurations(new Array(30).fill(1), 5 * 60)).toThrow(
      /30 questions/,
    );
  });

  it("accepte pile le minimum : 15 secondes par question", () => {
    const durees = allocateDurations(new Array(4).fill(2), 60);
    expect(sum(durees)).toBe(60);
    expect(durees).toEqual([15, 15, 15, 15]);
  });

  it("refuse une durée totale qui n'est pas un multiple de 5 secondes", () => {
    expect(() => allocateDurations([1, 1], 63)).toThrow(DurationError);
  });
});

describe("modification manuelle d'une durée", () => {
  it("réajuste les autres questions et garde le total exact", () => {
    const poids = new Array(10).fill(2);
    const durees = allocateDurations(poids, 20 * 60, { 3: 300 });
    expect(sum(durees)).toBe(1200);
    expect(durees[3]).toBe(300);
    for (const [index, duree] of durees.entries()) {
      if (index === 3) continue;
      expect(duree % STEP_SECONDS).toBe(0);
      expect(duree).toBeGreaterThanOrEqual(MIN_QUESTION_SECONDS);
    }
  });

  it("accepte plusieurs durées fixées à la main", () => {
    const durees = allocateDurations(new Array(6).fill(1), 15 * 60, {
      0: 200,
      5: 100,
    });
    expect(sum(durees)).toBe(900);
    expect(durees[0]).toBe(200);
    expect(durees[5]).toBe(100);
  });

  it("refuse une durée manuelle qui ne laisse pas 15 s aux autres", () => {
    expect(() =>
      allocateDurations(new Array(5).fill(1), 2 * 60, { 0: 110 }),
    ).toThrow(DurationError);
  });

  it("refuse une durée manuelle sous le minimum", () => {
    expect(() => allocateDurations([1, 1], 600, { 0: 10 })).toThrow(
      /15 secondes/,
    );
  });

  it("vérifie le total quand toutes les durées sont fixées à la main", () => {
    expect(allocateDurations([1, 1], 100, { 0: 40, 1: 60 })).toEqual([40, 60]);
    expect(() => allocateDurations([1, 1], 100, { 0: 40, 1: 40 })).toThrow(
      DurationError,
    );
  });
});

describe("durées venues du fichier", () => {
  it("garde les durées du CSV quand la case est cochée", () => {
    const questions = [
      makeQuestion({ fileDurationSeconds: 75 }),
      makeQuestion({ fileDurationSeconds: 120 }),
    ];
    expect(
      computeQuizDurations(questions, 45, { useFileDurations: true }),
    ).toEqual([75, 120]);
  });

  it("arrondit les durées du fichier sur 5 secondes, minimum 15", () => {
    const questions = [
      makeQuestion({ fileDurationSeconds: 7 }),
      makeQuestion({ fileDurationSeconds: 63 }),
    ];
    expect(
      computeQuizDurations(questions, 45, { useFileDurations: true }),
    ).toEqual([15, 65]);
  });

  it("ignore les durées du fichier par défaut", () => {
    const questions = [
      makeQuestion({ fileDurationSeconds: 75 }),
      makeQuestion({ fileDurationSeconds: 120 }),
    ];
    const durees = computeQuizDurations(questions, 10);
    expect(sum(durees)).toBe(600);
    expect(durees).not.toEqual([75, 120]);
  });
});

describe("snapDuration", () => {
  it("colle la saisie sur un multiple de 5, minimum 15", () => {
    expect(snapDuration(37)).toBe(35);
    expect(snapDuration(38)).toBe(40);
    expect(snapDuration(3)).toBe(15);
    expect(snapDuration(Number.NaN)).toBe(15);
  });
});
