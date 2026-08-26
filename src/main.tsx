import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'
import BootGuard from './BootGuard'

const rootElement = document.getElementById('root')

if (!rootElement) {
  document.body.innerHTML = `
    <main style="min-height:100vh;display:grid;place-items:center;background:#0b0806;color:#f4eadf;font-family:system-ui,sans-serif;padding:24px;box-sizing:border-box">
      <section style="max-width:620px;padding:28px;border:1px solid #5a3a22;background:#16100c">
        <strong style="color:#ff8a3d;letter-spacing:.2em">ANATHEMA</strong>
        <h1 style="font-size:30px;margin:12px 0 8px">Başlatma kökü bulunamadı</h1>
        <p style="opacity:.75;line-height:1.6">Uygulama DOM kökü oluşturulamadı. Sayfayı yenileyerek tekrar deneyin.</p>
      </section>
    </main>
  `
} else {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <BootGuard>
        <App />
      </BootGuard>
    </React.StrictMode>
  )
}
