/**
 * Mise à jour automatique de l'application installée.
 *
 * Le service worker généré par Workbox fait déjà `skipWaiting()` et `clientsClaim()` :
 * dès qu'une nouvelle version est *détectée*, elle s'installe et prend la main. Restaient
 * deux trous, qui obligeaient à vider le cache du navigateur à la main :
 *
 * 1. **Rien ne redéclenchait la détection.** `registerSW({ immediate: true })` interroge
 *    `sw.js` au chargement de la page, et plus jamais ensuite. Une application installée
 *    sur un téléphone est rouverte depuis l'arrière-plan pendant des jours sans une seule
 *    navigation : la nouvelle version n'était donc jamais vue.
 * 2. **La page ouverte gardait l'ancienne version en mémoire.** Prendre le contrôle ne
 *    réexécute pas le JavaScript ni ne réapplique la feuille de style déjà chargés. En
 *    mode application (iOS notamment), il n'y a pas de bouton « recharger » pour s'en
 *    sortir.
 *
 * D'où les deux moitiés ci-dessous : on redemande régulièrement, et on recharge quand la
 * relève a eu lieu. Le rechargement ne perd rien — position, zoom, filtres et fiche
 * ouverte vivent dans l'URL (voir `urlState.ts`), la même carte revient à la version
 * suivante.
 *
 * Les fichiers, eux, portent déjà une empreinte dans leur nom (`index-BhMLqXg2.css`) :
 * une fois le nouvel `index.html` servi, aucun composant ni aucune feuille de style
 * périmée ne peut subsister.
 */
import { registerSW } from 'virtual:pwa-register'

/** Vérification de fond, quand l'application reste ouverte longtemps. */
const CHECK_INTERVAL_MS = 60 * 60 * 1000

/**
 * Délai minimum entre deux vérifications. Sans lui, une personne qui bascule sans arrêt
 * entre ses applications déclencherait une requête à chaque retour.
 */
const MIN_CHECK_GAP_MS = 60 * 1000

export function setupAutoUpdate(): void {
  const serviceWorker = navigator.serviceWorker as ServiceWorkerContainer | undefined
  if (!serviceWorker) return

  // Un service worker pilotait-il déjà la page ? Sur une première visite il n'y en a pas,
  // et sa prise de contrôle n'apporte rien de neuf à afficher : recharger ne ferait
  // qu'un clignotement gratuit.
  const hadController = Boolean(serviceWorker.controller)
  let reloading = false

  serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return
    reloading = true
    window.location.reload()
  })

  // Le compteur démarre maintenant : on vient d'interroger `sw.js` en s'enregistrant,
  // inutile de recommencer si l'application passe en arrière-plan dans la foulée.
  let lastCheck = Date.now()

  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return

      const check = () => {
        lastCheck = Date.now()
        // Un échec ici n'est qu'un réseau absent : la vérification suivante reprendra.
        void registration.update().catch(() => undefined)
      }

      window.setInterval(check, CHECK_INTERVAL_MS)

      // Le moment qui compte sur un téléphone : le retour à l'application. C'est aussi
      // celui où un rechargement dérange le moins, la personne se réorientant déjà.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return
        if (Date.now() - lastCheck < MIN_CHECK_GAP_MS) return
        check()
      })
    },
  })
}
