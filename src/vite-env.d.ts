/// <reference types="vite/client" />

/**
 * Variables d'environnement lues au build (Vite les remplace par leur valeur littérale
 * dans le bundle : rien n'est lu à l'exécution).
 *
 * `tsconfig.json` déclare `types` explicitement, ce qui désactive l'inclusion
 * automatique des `@types/*` — mais pas ce fichier, qui est dans `include` : c'est ici
 * qu'une nouvelle variable doit être déclarée pour être typée ailleurs.
 */
interface ImportMetaEnv {
  /**
   * Clé de projet PostHog (« Project API key », commence par `phc_`).
   *
   * Elle est **publique par construction** : elle ne sert qu'à écrire des événements et
   * vit forcément dans le bundle d'un client statique. Ce n'est donc pas un secret, et
   * ce n'est pas une entorse au « aucune clé d'API » du projet — rien ne se lit avec.
   *
   * Absente, la mesure d'audience est entièrement désactivée : aucun script chargé,
   * aucun appel réseau. C'est le cas en développement et dans la CI.
   */
  readonly VITE_POSTHOG_KEY?: string

  /**
   * Hôte d'ingestion PostHog. Par défaut l'instance européenne
   * (`https://eu.i.posthog.com`), pour que les données restent dans l'UE.
   *
   * Le changer impose de changer `connect-src` dans les trois configurations de
   * `deploy/` **et** la liste `SERVICES` de `scripts/verifie-deploiement.mjs`, sinon la
   * CSP refuse les envois — en silence côté visiteur.
   */
  readonly VITE_POSTHOG_HOST?: string
}
