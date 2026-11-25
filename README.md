# Quiz en direct 🎯

Un quiz de classe façon Kahoot, pour **n'importe quel sujet**.
Vous projetez votre écran au vidéoprojecteur, vos apprenants jouent sur leur
téléphone. Chaque quiz s'importe depuis un simple fichier CSV.

- **Vous (formateur)** : `/formateur` — protégé par mot de passe
- **Vos apprenants** : `/` — pensé pour un téléphone Android d'entrée de gamme
- Hébergement **gratuit** : Vercel + Supabase

---

## Sommaire

1. [Les 2 comptes gratuits à créer](#1-les-2-comptes-gratuits-à-créer)
2. [Créer la base de données](#2-créer-la-base-de-données)
3. [Remplir le fichier `.env.local`](#3-remplir-le-fichier-envlocal)
4. [Lancer l'application sur votre ordinateur](#4-lancer-lapplication-sur-votre-ordinateur)
5. [Importer le quiz d'exemple](#5-importer-le-quiz-dexemple)
6. [Animer une séance](#6-animer-une-séance)
7. [Mettre en ligne sur Vercel](#7-mettre-en-ligne-sur-vercel)
8. [Créer un CSV pour un nouveau sujet](#8-créer-un-csv-pour-un-nouveau-sujet)
9. [Comment les durées sont calculées](#9-comment-les-durées-sont-calculées)
10. [Les règles du jeu](#10-les-règles-du-jeu)
11. [Vérifier que tout marche](#11-vérifier-que-tout-marche)
12. [Problèmes fréquents](#12-problèmes-fréquents)
13. [Pourquoi personne ne peut tricher](#13-pourquoi-personne-ne-peut-tricher)

---

## 1. Les 2 comptes gratuits à créer

| Service | À quoi ça sert | Lien |
| --- | --- | --- |
| **Supabase** | La base de données (les quiz, les joueurs, les réponses) et le direct | <https://supabase.com> |
| **Vercel** | Héberger le site sur Internet | <https://vercel.com> |
| GitHub | Déposer le code, pour que Vercel le récupère | <https://github.com> |

Les trois sont gratuits pour cet usage. Créez les comptes avec la même adresse
e-mail, c'est plus simple.

Il vous faut aussi **Node.js** version 20 ou plus sur votre ordinateur :
<https://nodejs.org> (prenez la version « LTS »).

Pour vérifier, ouvrez un terminal et tapez :

```bash
node -v
```

Si un numéro s'affiche (par exemple `v24.16.0`), c'est bon.

---

## 2. Créer la base de données

1. Allez sur <https://supabase.com>, connectez-vous, puis **New project**.
   - Nom : `quizz` (ou ce que vous voulez)
   - Mot de passe de la base : laissez Supabase en générer un et gardez-le
   - Région : **West EU (Ireland)** si vous êtes en Afrique ou en Europe
2. Attendez 1 à 2 minutes que le projet soit prêt.
3. Dans le menu de gauche, cliquez sur **SQL Editor**, puis **New query**.
4. Ouvrez le fichier **`supabase/schema.sql`** de ce dossier, **copiez tout**
   son contenu, collez-le dans la fenêtre, et cliquez sur **Run**.
5. Vous devez voir `Success. No rows returned`. C'est normal et c'est gagné.

Pour vérifier : menu **Table Editor**, vous devez voir 6 tables —
`quizzes`, `questions`, `games`, `players`, `player_secrets`, `answers`.

> Ce script peut être relancé sans danger : il ne supprime rien.

### Si votre base existait déjà avant novembre 2025

Un correctif est à passer **une seule fois**, de la même manière (SQL Editor →
New query → coller → Run) :

```
supabase/correctif-01-charge-classe.sql
```

Sans lui, le quiz se figeait sur la question 1 dès qu'une classe entière se
connectait. Le fichier explique pourquoi en détail. Il ne touche aucune
donnée : vos quiz, vos parties et vos résultats restent en place. Si vous
venez de créer la base avec `schema.sql`, le correctif est déjà inclus et
vous n'avez rien à faire.

---

## 3. Remplir le fichier `.env.local`

Ce fichier contient vos clés. **Il ne part jamais sur GitHub** (il est protégé
par `.gitignore`).

Copiez `.env.example` et renommez la copie en `.env.local`, puis remplissez-le.

Les 3 valeurs Supabase se trouvent dans **Project Settings → API Keys** :

| Ligne de `.env.local` | Où la trouver | À quoi elle ressemble |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → **Data API** → Project URL | `https://abcdefgh.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project Settings → API Keys → **Publishable key** | `sb_publishable_...` |
| `SUPABASE_SECRET_KEY` | Project Settings → API Keys → **Secret keys** → *Reveal* puis *Copy* | `sb_secret_...` |

> Si votre projet n'affiche que **Legacy API keys**, prenez `anon` pour la clé
> publique et `service_role` pour la clé secrète. Les deux formats marchent.

Et choisissez votre mot de passe formateur :

```
ADMIN_PASSWORD=unMotDePasseQueVousChoisissez
```

### ⚠️ La règle à ne jamais oublier

- `NEXT_PUBLIC_...` = **public**, part dans le navigateur, c'est normal.
- `SUPABASE_SECRET_KEY` = **secret absolu**. Elle donne tous les droits sur
  votre base. Elle ne doit apparaître **que** dans `.env.local` et dans les
  variables d'environnement de Vercel. Jamais dans un message, jamais sur
  GitHub, jamais dans une capture d'écran.

---

## 4. Lancer l'application sur votre ordinateur

Ouvrez un terminal dans le dossier du projet :

```bash
npm install     # la première fois seulement
npm run dev
```

Puis ouvrez <http://localhost:3000> dans votre navigateur.

- <http://localhost:3000> → l'écran des apprenants
- <http://localhost:3000/formateur> → votre écran (mot de passe = `ADMIN_PASSWORD`)

Pour arrêter l'application : `Ctrl + C` dans le terminal.

### Tester avec un vrai téléphone, sur votre ordinateur

`localhost` ne marche que sur votre ordinateur. Pour qu'un téléphone du même
réseau Wi-Fi puisse jouer, trouvez l'adresse IP de votre ordinateur :

```bash
ipconfig        # sur Windows : cherchez « Adresse IPv4 », par ex. 192.168.1.12
```

Sur le téléphone, ouvrez `http://192.168.1.12:3000`.
En classe, le plus simple reste la version en ligne sur Vercel (section 7).

---

## 5. Importer le quiz d'exemple

Le dossier contient `questions_ccaof_module01.csv` (30 questions).
Avec l'application lancée (`npm run dev`), dans un **second** terminal :

```bash
npm run seed
```

Cela crée le quiz **« Claude Module 01 – CCAO-F »**, durée totale
**45 minutes**, dans votre bibliothèque.

Vous pouvez aussi le faire à la main : `/formateur` → **Importer un quiz** →
titre, 45 minutes, choisir le fichier.

---

## 6. Animer une séance

1. Sur l'ordinateur relié au vidéoprojecteur, ouvrez `/formateur` et
   connectez-vous.
   *Avant le premier cours, passez par **« 🔊 Tester le son »** pour vérifier
   le volume de la salle.*
2. Réglez si besoin le **seuil de réussite** (72 % par défaut) et le
   **mode moqueur**.
3. Choisissez un quiz → **Créer une partie**.
4. Le **code à 6 caractères** s'affiche en très grand, avec un **QR code**.
   Les apprenants ouvrent l'adresse du site, tapent leur nom et ce code.
5. Vous les voyez arriver un par un (« Marie a rejoint le quiz ! »).
   Vous pouvez retirer quelqu'un avec la petite croix.
6. **Lancer le quiz** dès qu'il y a au moins un joueur.
7. Pendant le quiz, vous disposez de **Pause**, **Corriger maintenant**,
   **Question suivante** et **Terminer le quiz**.
8. Après chaque question, l'écran projeté enchaîne deux temps :
   d'abord **la bonne réponse** et la répartition des réponses, puis le
   **classement en plein écran**, barres animées, pour que chacun voie sa
   position avant la question suivante. Les apprenants voient le même
   classement sur leur téléphone, avec leur ligne mise en évidence.
   Vous pouvez couper court à tout moment avec **Question suivante**.
9. À la fin : podium, confettis, tableau complet, et
   **Exporter les résultats en CSV**.

> **Gardez l'écran formateur ouvert** du début à la fin : c'est lui qui fait
> avancer les questions. Si vous le fermez, le quiz s'arrête d'avancer ; il
> suffit de rouvrir la page de la partie (menu **Historique**) pour reprendre.

Le son et la musique démarrent au premier clic (« Créer une partie » pour vous,
« Entrer dans le quiz » pour les apprenants) : les navigateurs interdisent le
son avant une action de l'utilisateur.

Plusieurs parties peuvent tourner en même temps, avec des codes différents.

---

## 7. Mettre en ligne sur Vercel

### 7.1 Déposer le code sur GitHub

Si ce n'est pas déjà fait :

```bash
git init
git add .
git commit -m "Mon quiz"
```

Sur <https://github.com> → **New repository** → nom `quizz` → **Private** →
**Create repository**. GitHub affiche alors deux lignes à copier, du type :

```bash
git remote add origin https://github.com/VOTRE-NOM/quizz.git
git push -u origin main
```

> Vérifiez que `.env.local` n'apparaît **pas** sur GitHub. S'il y est,
> changez immédiatement vos clés dans Supabase.

### 7.2 Importer le projet dans Vercel

1. <https://vercel.com> → **Add New…** → **Project**
2. **Import Git Repository** → autorisez GitHub → choisissez `quizz`
3. Vercel reconnaît Next.js tout seul : **ne changez aucun réglage**
   (Framework Preset : Next.js, Build Command : `npm run build`)

### 7.3 Les variables d'environnement (l'étape qu'on oublie)

Avant de cliquer sur **Deploy**, ouvrez **Environment Variables** et ajoutez
les **4** lignes, une par une (Name / Value) :

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` |
| `SUPABASE_SECRET_KEY` | `sb_secret_...` |
| `ADMIN_PASSWORD` | votre mot de passe formateur |

Ce sont exactement les lignes de votre `.env.local`. Laissez les trois
environnements cochés (Production, Preview, Development).

4. **Deploy**, puis attendez 1 à 2 minutes.
5. Vercel vous donne une adresse du type `https://quizz-xyz.vercel.app`.
   **C'est cette adresse que vous donnez à vos apprenants.**

### 7.4 La région des fonctions : à ne pas négliger

Le fichier `vercel.json` contient une seule ligne utile :

```json
{ "regions": ["dub1"] }
```

`dub1`, c'est Dublin — **le même endroit que votre base Supabase** si vous
avez suivi la section 2 (West EU / Ireland). C'est volontaire et c'est
important.

Vercel choisit sinon une région par défaut qui n'a rien à voir avec celle de
votre base. Sur ce projet, les fonctions tournaient à **São Paulo** pendant
que la base était en Irlande : chaque lecture traversait l'Atlantique deux
fois. Mesuré : la correction d'une question prenait **3,2 s depuis le Brésil**
contre **1,9 s depuis un ordinateur à Douala**. Le serveur était plus lent
que l'ordinateur du formateur, ce qui n'a aucun sens — sauf quand la base est
à 10 000 km.

Si un jour vous changez la région de votre base Supabase, changez aussi cette
ligne. Les codes utiles : `dub1` Dublin, `cdg1` Paris, `fra1` Francfort,
`iad1` Washington, `gru1` São Paulo.

### 7.5 Après coup

- Vous modifiez le code ? `git push` suffit : Vercel redéploie tout seul.
- Vous changez une variable d'environnement ? Il faut **redéployer** :
  onglet **Deployments** → `...` → **Redeploy**.
- **Ne partagez que l'adresse principale** (`mon-quiz.vercel.app`) à vos
  apprenants. Les adresses de déploiement, du genre
  `mon-quiz-7fnzcv1uj-equipe.vercel.app`, sont protégées par Vercel : vos
  apprenants tomberaient sur une demande de connexion.

---

## 8. Créer un CSV pour un nouveau sujet

Le plus simple : cliquez sur **« Télécharger le modèle CSV »** dans la page
d'import, ouvrez-le, et remplacez les 3 exemples par vos questions.

### Les colonnes

```
theme,domaine,question,reponse_A,reponse_B,reponse_C,reponse_D,bonnes_reponses,duree_secondes,explication
```

| Colonne | Obligatoire | Explication |
| --- | --- | --- |
| `theme` | non | Pour vous y retrouver, par ex. « Excel débutant » |
| `domaine` | non | Sous-partie, affichée en petit à l'écran |
| `question` | **oui** | 400 caractères maximum |
| `reponse_A` | **oui** | 180 caractères maximum |
| `reponse_B` | **oui** | |
| `reponse_C` | non | Laissez vide pour une question à 2 choix |
| `reponse_D` | non | Laissez vide pour une question à 3 choix |
| `bonnes_reponses` | **oui** | `B`, ou `A;C` s'il y en a plusieurs |
| `duree_secondes` | non | **Ignorée par défaut** (voir section 9) |
| `explication` | non | Affichée après la question. Très utile en formation |

### Avec Google Sheets (recommandé)

1. Première ligne : les 10 noms de colonnes ci-dessus, une par cellule.
2. Une question par ligne.
3. **Fichier → Télécharger → Valeurs séparées par des virgules (.csv)**

### Avec Excel en français

1. Mêmes en-têtes, une question par ligne.
2. **Fichier → Enregistrer sous → CSV UTF-8 (délimité par des virgules)**.
   Ce format garde les accents.
3. Si Excel enregistre avec des **points-virgules**, ce n'est pas grave :
   l'application accepte les deux.

### Les pièges à éviter

- Une virgule dans votre texte ? Mettez la cellule entre guillemets — Excel et
  Google Sheets le font tout seuls.
- `bonnes_reponses` doit contenir des lettres (`A`, `B`, `C`, `D`), pas le texte
  de la réponse.
- Ne laissez pas de trou : si `reponse_C` est vide, `reponse_D` doit l'être aussi.
- En cas d'erreur, l'application vous dit **la ligne exacte** et le problème,
  par exemple : *« Ligne 12 : la bonne réponse « E » n'existe pas. »*

---

## 9. Comment les durées sont calculées

Vous donnez **une durée totale** (par exemple 45 minutes) et l'application
répartit le temps toute seule :

- une question **compte double** si elle est **longue** (plus de 120 caractères,
  réponses comprises) **ou** si elle a **plusieurs bonnes réponses** ;
- chaque durée est un multiple de **5 secondes**, avec au moins **15 secondes** ;
- le **total tombe exactement** sur la durée demandée.

Avant d'enregistrer, l'**aperçu** montre chaque question avec sa durée et le
total. Vous pouvez **modifier une durée à la main** : les autres se réajustent
pour que le total reste juste. La case **« Utiliser les durées du fichier »**
garde à la place la colonne `duree_secondes` du CSV.

Vous pouvez aussi changer la durée totale plus tard, depuis la bibliothèque :
les durées de toutes les questions sont recalculées.

---

## 10. Les règles du jeu

| Situation | Points |
| --- | --- |
| Mauvaise réponse | **0** et la série repart de zéro |
| Pas de réponse à temps | **0** et la série repart de zéro |
| Bonne réponse | de **500 à 1000**, selon la rapidité |
| 3 bonnes réponses de suite | **+100** de bonus, et « 🔥 Série de 3 ! » |

Une question à plusieurs bonnes réponses n'est juste que si l'apprenant a coché
**exactement** les bonnes.

Tout est calculé **par le serveur**, à partir de l'heure de début enregistrée en
base : impossible de gagner des points en trichant sur l'horloge du téléphone.

À la fin, chaque apprenant est **« Réussi »** ou **« À retravailler »** selon le
seuil que vous avez choisi (72 % par défaut).

---

## 11. Vérifier que tout marche

```bash
npm test        # 89 vérifications : lecture du CSV, calcul des durées, points
npm run build   # vérifie que le projet compile comme sur Vercel
```

Et la simulation d'une partie entière, avec 1 formateur et 3 faux apprenants
(un qui répond juste, un qui répond faux, un qui ne répond jamais) :

```bash
npm run dev       # dans un terminal
npm run simulate  # dans un autre
```

La simulation joue les 30 questions, vérifie qu'aucune n'est sautée ni rejouée,
que les points et le bonus de série sont corrects, que le téléphone ne reçoit
jamais la bonne réponse avant la correction, et que l'export CSV est complet.
Comptez quelques minutes : elle fait environ 240 appels réseau.

Puis l'épreuve de la **classe entière**, celle qui compte si vous évaluez
trente personnes à la fois :

```bash
npm run simuler-classe        # 20 apprenants
N=60 npm run simuler-classe   # 60 apprenants
```

Vingt apprenants rejoignent la partie, répondent **tous en même temps**, et le
script mesure ce que chaque téléphone reçoit. C'est ce test qui a révélé que
la correction d'une question produisait 41 messages par téléphone, soit plus
de 800 appels pour la salle : à quarante apprenants, le quiz se figeait sur la
question 1. Il vaut la peine de le relancer après toute modification de
l'écran apprenant ou de l'écran formateur.

Enfin, le contrôle de sécurité et du direct :

```bash
npm run verifier
```

Ce script se met à la place du navigateur d'un apprenant, avec la clé publique :
il essaie de lire les questions, les bonnes réponses et les jetons (tout doit
être refusé), tente de se donner 999 999 points (cela doit échouer), et vérifie
que Supabase Realtime diffuse bien les arrivées de joueurs et les changements
de question. C'est le test à relancer si vous changez les règles de sécurité
dans `supabase/schema.sql`.

Les tests n'utilisent **aucune bibliothèque** : ils tournent avec le lanceur
intégré à Node (`node --test`).

---

## 12. Problèmes fréquents

**« SUPABASE_SECRET_KEY n'est pas défini »**
Le fichier `.env.local` manque, est mal nommé, ou la ligne est vide.
Après l'avoir modifié, **arrêtez et relancez** `npm run dev` : les variables ne
sont lues qu'au démarrage.

**« relation "quizzes" does not exist » ou « Could not find the table »**
Le script SQL n'a pas été exécuté. Reprenez la [section 2](#2-créer-la-base-de-données).

**« Mot de passe incorrect » sur `/formateur`**
C'est `ADMIN_PASSWORD` de `.env.local` (ou des variables Vercel). Attention aux
espaces en fin de ligne. Si vous le changez, tout le monde est déconnecté :
c'est voulu.

**« Ce code ne correspond à aucune partie »**
Le code n'est valable que pour **une** partie. Si vous avez recréé une partie,
le code a changé. Les caractères ambigus n'existent pas dans les codes : il n'y
a jamais de `0`, `O`, `1`, `I` ni `L`.

**« Le quiz a déjà commencé »**
On ne rejoint une partie que depuis la salle d'attente. Créez une nouvelle
partie pour les retardataires.

**Les joueurs n'apparaissent pas en direct sur l'écran formateur**
Vérifiez que le script SQL a bien été exécuté **en entier** : la toute dernière
partie active Supabase Realtime. Par sécurité, l'écran se rafraîchit aussi tout
seul toutes les 3 secondes, donc un retard de quelques secondes n'est pas grave.

**Pas de son ou pas de voix sur un téléphone**
Ouvrez **`/formateur` → « 🔊 Tester le son »** : cette page joue chaque musique
et chaque bruitage sur commande, et vous dit si une voix française est
installée sur l'appareil. Faites-le depuis le téléphone, c'est là que ça
compte.

Les causes habituelles, dans l'ordre :
1. le son ne démarre qu'**après le premier toucher de l'écran** (c'est une
   règle des navigateurs, pas un réglage de l'application) ;
2. le téléphone est en mode silencieux, ou le volume média est à zéro ;
3. aucune **voix française** n'est installée : les phrases s'affichent et les
   bruitages jouent, mais rien n'est prononcé. C'est prévu et sans gravité.
   Sur Android : *Paramètres → Système → Langues et saisie → Sortie de
   synthèse vocale → installer les données vocales françaises*.

La musique est volontairement **trois fois moins forte** que les bruitages
(mesuré : −13 dB contre −3 dB), pour animer sans couvrir votre voix.

**Le quiz n'avance plus**
L'écran formateur a été fermé ou l'ordinateur s'est mis en veille. Rouvrez la
page de la partie (menu **Historique** → **Ouvrir**) et cliquez sur
**Question suivante**.

**Le quiz se figeait sur la question 1 avec toute une classe**
C'était un vrai défaut, corrigé. Chaque réponse enregistrée et chaque score
mis à jour envoyaient un message à tous les téléphones, et chaque message
déclenchait un appel au serveur : pour une classe de vingt, la correction
d'une seule question produisait plus de 800 appels — et le coût augmentait
comme le carré du nombre d'apprenants. Deux choses à vérifier si vous
retrouvez ce comportement :

1. le correctif `supabase/correctif-01-charge-classe.sql` a bien été passé
   dans Supabase (voir la section 2) ;
2. la version mise en ligne sur Vercel est à jour — un `git push` déclenche
   un nouveau déploiement, attendez qu'il soit terminé.

Pour le vérifier vous-même : `npm run simuler-classe`.

**Une erreur en déployant sur Vercel**
Dans 9 cas sur 10, une variable d'environnement manque. Onglet **Settings →
Environment Variables**, vérifiez les 4 lignes, puis **Redeploy**.

---

## 13. Pourquoi personne ne peut tricher

C'est le point le plus important si vous notez vos apprenants.

- **Les bonnes réponses ne quittent jamais le serveur** avant la fin de la
  question. Un apprenant qui inspecterait son téléphone ne verrait que le texte
  de la question et les propositions.
- **Son score ne bouge qu'à la correction**, en même temps que l'affichage pour
  toute la salle : impossible de savoir si l'on a juste en regardant ses points.
- **Le temps et les points sont calculés par le serveur**, à partir de l'heure
  de début enregistrée en base.
- **Une seule réponse par question** est acceptée (garanti par la base).
- **Le passage à la question suivante est vérifié** côté serveur : aucune
  question ne peut être sautée ni rejouée, même en cliquant deux fois.
- **La base est verrouillée** : le navigateur ne peut lire que deux tables sans
  secret (l'état de la partie et la liste des joueurs avec leurs scores) et ne
  peut **rien écrire**. Les questions, les bonnes réponses et les réponses des
  apprenants ne lui sont pas accessibles du tout.
- **Tous les textes affichés sont échappés** : un nom ou une question
  contenant du code HTML s'affiche comme du texte.

---

## Organisation des fichiers

```
src/app/                 les pages et les routes API
  page.tsx               écran d'entrée des apprenants
  jouer/                 écran de jeu des apprenants
  formateur/             bibliothèque, import, partie, historique, son
  api/                   toutes les routes serveur
  globals.css            le thème « arcade néon »
src/lib/                 le cœur du programme
  csv.ts                 lecture et validation du CSV
  durations.ts           calcul des durées
  scoring.ts             points et bonus de série
  entrees.ts             nettoyage de ce qui vient du navigateur
  game-server.ts         déroulement de la partie (serveur)
  audio/                 musique, bruitages et voix
src/components/          chrono, boutons, podium, confettis…
src/tests/               les tests automatiques
scripts/                 import du quiz d'exemple, simulation, sécurité
supabase/schema.sql      le script à coller dans Supabase
```

---

Bonne formation ! 🎓
