"use client";

import { useEffect, useRef } from "react";

const COULEURS = ["#e8453c", "#ffc72c", "#3aa757", "#3b82c4", "#8e44ad", "#ffffff"];

/**
 * Confettis dessinés sur un canvas : léger, sans bibliothèque.
 * Rien ne s'affiche si la personne a demandé à réduire les animations.
 */
export function Confettis({
  actif,
  duree = 2600,
  nombre = 90,
}: {
  actif: boolean;
  duree?: number;
  nombre?: number;
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!actif) return;
    const element = canvas.current;
    if (!element) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = element.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const largeur = element.clientWidth;
    const hauteur = element.clientHeight;
    element.width = largeur * dpr;
    element.height = hauteur * dpr;
    ctx.scale(dpr, dpr);

    const morceaux = Array.from({ length: nombre }, () => ({
      x: Math.random() * largeur,
      y: -20 - Math.random() * hauteur * 0.5,
      taille: 5 + Math.random() * 7,
      vitesse: 1.8 + Math.random() * 2.8,
      derive: (Math.random() - 0.5) * 1.6,
      rotation: Math.random() * Math.PI,
      vitesseRotation: (Math.random() - 0.5) * 0.22,
      couleur: COULEURS[Math.floor(Math.random() * COULEURS.length)],
    }));

    let image = 0;
    const debut = performance.now();

    const dessiner = () => {
      const maintenant = performance.now();
      if (maintenant - debut > duree) {
        ctx.clearRect(0, 0, largeur, hauteur);
        return;
      }
      ctx.clearRect(0, 0, largeur, hauteur);
      for (const morceau of morceaux) {
        morceau.y += morceau.vitesse;
        morceau.x += morceau.derive;
        morceau.rotation += morceau.vitesseRotation;
        if (morceau.y > hauteur + 20) {
          morceau.y = -20;
          morceau.x = Math.random() * largeur;
        }
        ctx.save();
        ctx.translate(morceau.x, morceau.y);
        ctx.rotate(morceau.rotation);
        ctx.fillStyle = morceau.couleur;
        ctx.fillRect(
          -morceau.taille / 2,
          -morceau.taille / 4,
          morceau.taille,
          morceau.taille / 2,
        );
        ctx.restore();
      }
      image = requestAnimationFrame(dessiner);
    };

    image = requestAnimationFrame(dessiner);
    return () => cancelAnimationFrame(image);
  }, [actif, duree, nombre]);

  if (!actif) return null;

  return (
    <canvas
      ref={canvas}
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 50,
      }}
    />
  );
}
