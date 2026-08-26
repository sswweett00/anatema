import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'

function showBootError(error: unknown) {
  const root = document.getElementById('root')
  const message = error instanceof Error ? error.message : String(error)
  const safe = message.replace(/[<>&]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[char] ?? char))
  const target = root ?? document.body
  target.innerHTML = `
    <main style="min-height:100dvh;display:grid;place-items:center;background:#0b0806;color:#f4eadf;font-family:system-ui,sans-serif;padding:24px;box-sizing:border-box">
      <section role="alert" style="width:min(680px,100%);padding:28px;border:1px solid #5a3a22;background:#16100c;box-shadow:0 0 50px rgba(0,0,0,.45)">
        <strong style="color:#ff8a3d;letter-spacing:.22em">ANATHEMA</strong>
        <h1 style="font-size:30px;margin:12px 0 8px">Başlatma başarısız</h1>
        <p style="opacity:.75;line-height:1.6">Uygulama modülleri yüklenemedi. Siyah ekran bırakmak yerine gerçek hata gösteriliyor.</p>
        <code style="display:block;margin:16px 0;padding:12px;overflow:auto;white-space:pre-wrap;word-break:break-word;background:#0b0806;color:#d9cfb4;font-size:12px">${safe}</code>
        <button type="button" onclick="location.reload()" style="border:1px solid #8a4a2a;background:#2a1608;color:#ffe9d2;padding:11px 18px;cursor:pointer;font-weight:800">YENİDEN DENE</button>
      </section>
    </main>
  `
}

async function bootstrap() {
  const rootElement = document.getElementById('root')
  if (!rootElement) {
    showBootError(new Error('DOM kökü #root bulunamadı.'))
    return
  }

  try {
    const [{ default: App }, { default: BootGuard }] = await Promise.all([
      import('./App'),
      import('./BootGuard'),
    ])

    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <BootGuard>
          <App />
        </BootGuard>
      </React.StrictMode>,
    )
  } catch (error) {
    console.error('[ANATHEMA] bootstrap failed', error)
    showBootError(error)
  }
}

void bootstrap()
