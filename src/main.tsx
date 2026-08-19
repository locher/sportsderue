import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { setupAutoUpdate } from './lib/appUpdate'
import { startAudience } from './lib/audience'
import './index.css'

const container = document.getElementById('root')
if (!container) throw new Error('Élément racine introuvable')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Mise à jour silencieuse : l'application reste utilisable hors-ligne avec la dernière
// version consultée, cherche une nouvelle version à chaque retour au premier plan, et se
// recharge d'elle-même quand elle en trouve une.
setupAutoUpdate()

// Mesure d'audience : rien n'est chargé sans clé de projet fournie au build, et jamais
// avant que la page soit à l'écran (voir `lib/audience.ts`).
startAudience()
