/**
 * Petites vérifications pour les tests.
 *
 * Les tests tournent avec le lanceur intégré à Node (`node --test`) :
 * aucune bibliothèque de test à installer, rien à configurer, et cela
 * fonctionne aussi bien sous Windows que sur le serveur de Vercel.
 *
 * Ce fichier ne fait qu'habiller `node:assert` pour que les tests se
 * lisent en une ligne : expect(x).toBe(y).
 */

import assert from "node:assert/strict";

function describeValue(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value) || (value && typeof value === "object")) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export interface Verification {
  /** Égalité stricte (===). */
  toBe(expected: unknown): void;
  /** Égalité en profondeur, pour les tableaux et les objets. */
  toEqual(expected: unknown): void;
  /** Longueur d'un tableau ou d'une chaîne. */
  toHaveLength(expected: number): void;
  /** Un tableau contient l'élément, ou une chaîne contient le morceau. */
  toContain(expected: unknown): void;
  toBeNull(): void;
  toBeGreaterThan(expected: number): void;
  toBeGreaterThanOrEqual(expected: number): void;
  toBeLessThan(expected: number): void;
  toBeLessThanOrEqual(expected: number): void;
  /** La fonction passée à expect() doit lever une erreur. */
  toThrow(expected?: RegExp | (new (...args: never[]) => Error)): void;
  not: {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toContain(expected: unknown): void;
  };
}

export function expect(actual: unknown): Verification {
  const asNumber = (): number => {
    assert.equal(
      typeof actual,
      "number",
      `attendu un nombre, reçu ${describeValue(actual)}`,
    );
    return actual as number;
  };

  return {
    toBe(expected) {
      assert.strictEqual(actual, expected);
    },
    toEqual(expected) {
      assert.deepStrictEqual(actual, expected);
    },
    toHaveLength(expected) {
      const value = actual as { length?: number } | null;
      assert.ok(
        value !== null && value !== undefined && typeof value.length === "number",
        `${describeValue(actual)} n'a pas de longueur`,
      );
      assert.strictEqual(
        value!.length,
        expected,
        `longueur ${value!.length} au lieu de ${expected} : ${describeValue(actual)}`,
      );
    },
    toContain(expected) {
      if (Array.isArray(actual)) {
        assert.ok(
          actual.includes(expected),
          `${describeValue(actual)} ne contient pas ${describeValue(expected)}`,
        );
        return;
      }
      assert.ok(
        typeof actual === "string" && actual.includes(String(expected)),
        `${describeValue(actual)} ne contient pas ${describeValue(expected)}`,
      );
    },
    toBeNull() {
      assert.strictEqual(actual, null);
    },
    toBeGreaterThan(expected) {
      const value = asNumber();
      assert.ok(value > expected, `${value} n'est pas supérieur à ${expected}`);
    },
    toBeGreaterThanOrEqual(expected) {
      const value = asNumber();
      assert.ok(
        value >= expected,
        `${value} n'est pas supérieur ou égal à ${expected}`,
      );
    },
    toBeLessThan(expected) {
      const value = asNumber();
      assert.ok(value < expected, `${value} n'est pas inférieur à ${expected}`);
    },
    toBeLessThanOrEqual(expected) {
      const value = asNumber();
      assert.ok(
        value <= expected,
        `${value} n'est pas inférieur ou égal à ${expected}`,
      );
    },
    toThrow(expected) {
      assert.ok(
        typeof actual === "function",
        "expect(...).toThrow() attend une fonction",
      );
      assert.throws(actual as () => unknown, expected ?? undefined);
    },
    not: {
      toBe(expected) {
        assert.notStrictEqual(actual, expected);
      },
      toEqual(expected) {
        assert.notDeepStrictEqual(actual, expected);
      },
      toContain(expected) {
        if (Array.isArray(actual)) {
          assert.ok(
            !actual.includes(expected),
            `${describeValue(actual)} contient ${describeValue(expected)}`,
          );
          return;
        }
        assert.ok(
          !(typeof actual === "string" && actual.includes(String(expected))),
          `${describeValue(actual)} contient ${describeValue(expected)}`,
        );
      },
    },
  };
}
