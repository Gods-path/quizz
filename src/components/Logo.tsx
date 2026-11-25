import Image from "next/image";

/**
 * Le logo de l'application.
 *
 * Le fond vert d'origine a été détouré : le PNG est transparent, il se
 * pose donc aussi bien sur le fond clair des pages que sur le vert de
 * l'écran de classement. Il pèse 19 Ko, ce qui reste raisonnable pour
 * une première ouverture en 3G.
 *
 * `priority` sur les écrans d'accueil : c'est la première chose que
 * l'apprenant doit voir, elle ne doit pas arriver en retard.
 */
export function Logo({
  largeur = 240,
  priority = false,
  className,
}: {
  largeur?: number;
  priority?: boolean;
  className?: string;
}) {
  // Le fichier fait 480 × 255 : on garde ce rapport pour éviter
  // tout décalage de mise en page pendant le chargement.
  const hauteur = Math.round((largeur * 255) / 480);

  return (
    <Image
      src="/logo.png"
      alt="Quizz"
      width={largeur}
      height={hauteur}
      priority={priority}
      className={className}
      // `display: block` + marges automatiques : next/image rend une
      // image de niveau bloc, que text-align ne centrerait pas.
      style={{ display: "block", height: "auto", margin: "0 auto", maxWidth: "100%" }}
    />
  );
}
