import { describe, it } from "node:test";
import { expect } from "./verifier.ts";
import { asInt, asString, cleanPlayerName } from "../lib/entrees.ts";

describe("asInt", () => {
  it("lit un nombre ou un texte qui représente un nombre", () => {
    expect(asInt(72)).toBe(72);
    expect(asInt("72")).toBe(72);
    expect(asInt(" 45 ")).toBe(45);
    expect(asInt(0)).toBe(0);
    expect(asInt("0")).toBe(0);
  });

  it("arrondit les décimales", () => {
    expect(asInt(71.6)).toBe(72);
    expect(asInt("71.4")).toBe(71);
  });

  // C'est LE piège qui avait mis le seuil de réussite à 0 % : Number("")
  // vaut 0, donc une valeur absente passait pour un vrai zéro et le
  // « ?? valeurParDefaut » ne s'appliquait jamais.
  it("renvoie null quand la valeur est absente, pour que le défaut s'applique", () => {
    expect(asInt(undefined)).toBeNull();
    expect(asInt(null)).toBeNull();
    expect(asInt("")).toBeNull();
    expect(asInt("   ")).toBeNull();
    expect(asInt(undefined) ?? 72).toBe(72);
  });

  it("renvoie null pour ce qui n'est pas un nombre", () => {
    expect(asInt("abc")).toBeNull();
    expect(asInt({})).toBeNull();
    expect(asInt([])).toBeNull();
    expect(asInt(Number.NaN)).toBeNull();
    expect(asInt(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("asString", () => {
  it("coupe à la longueur demandée et retire les espaces", () => {
    expect(asString("  bonjour  ")).toBe("bonjour");
    expect(asString("abcdef", 3)).toBe("abc");
  });

  it("renvoie une chaîne vide pour tout ce qui n'est pas du texte", () => {
    expect(asString(42)).toBe("");
    expect(asString(null)).toBe("");
    expect(asString(undefined)).toBe("");
  });
});

describe("cleanPlayerName", () => {
  it("limite le nom à 24 caractères", () => {
    expect(cleanPlayerName("a".repeat(40))).toHaveLength(24);
  });

  it("garde les accents et les espaces internes", () => {
    expect(cleanPlayerName("  Marie   Noubé ")).toBe("Marie Noubé");
  });

  it("retire les caractères de contrôle", () => {
    expect(cleanPlayerName("Ma\u0000ri\u001be")).toBe("Marie");
  });

  it("neutralise les retours à la ligne et les tabulations", () => {
    expect(cleanPlayerName("Marie\n\tPaul")).toBe("Marie Paul");
  });

  it("renvoie une chaîne vide pour ce qui n'est pas du texte", () => {
    expect(cleanPlayerName(null)).toBe("");
    expect(cleanPlayerName(12)).toBe("");
  });

  // Le texte reste affiché par React, qui l'échappe : ce test documente
  // que le nom n'est PAS transformé, il est seulement nettoyé.
  it("laisse le texte tel quel, l'échappement est fait à l'affichage", () => {
    expect(cleanPlayerName("<b>Marie</b>")).toBe("<b>Marie</b>");
  });
});
