// First, so the browser's install offer is caught even if it fires before React renders.
import './features/pwa/installPrompt'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyManifest } from './features/pwa/manifest'
import { registerServiceWorker } from './features/pwa/registerServiceWorker'

// Name the right app (customer or partner) before the browser reads the manifest.
applyManifest(window.location.pathname)
registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
