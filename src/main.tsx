import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './index.css'

const container = document.getElementById('root')
if (!container) throw new Error('Élément racine introuvable')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Mise à jour silencieuse du service worker : l'application reste utilisable hors-ligne
// avec la dernière version consultée, puis se met à jour au prochain lancement.
registerSW({ immediate: true })
