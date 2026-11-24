import { buildTemplateCsv } from "@/lib/csv";

/**
 * Le fichier « Télécharger le modèle CSV » : les bons en-têtes et trois
 * questions d'exemple (choix simple, choix multiple, vrai/faux).
 * Il est fabriqué par le même code que celui qui relit les fichiers, donc
 * il est forcément valide — c'est vérifié par les tests.
 */
export async function GET() {
  return new Response(buildTemplateCsv(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        "attachment; filename*=UTF-8''modele-quiz.csv",
    },
  });
}
