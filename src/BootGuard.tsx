import { Component, useEffect, useRef, useState, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

function toError(value: unknown, fallback: string): Error {
  if (value instanceof Error) return value
  if (typeof value === 'string' && value.trim()) return new Error(value)
  try {
    return new Error(value == null ? fallback : JSON.stringify(value))
  } catch {
    return new Error(fallback)
  }
}

function CrashScreen({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <main role="alert" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, boxSizing: 'border-box', background: '#0b0806', color: '#f4eadf', fontFamily: 'system-ui, sans-serif' }}>
      <section style={{ width: 'min(680px, 100%)', padding: 28, border: '1px solid #5a3a22', background: '#16100c', boxShadow: '0 0 50px rgba(0,0,0,.45)' }}>
        <div style={{ color: '#ff8a3d', letterSpacing: '.22em', fontSize: 12, fontWeight: 800 }}>ANATHEMA</div>
        <h1 style={{ margin: '10px 0 8px', fontSize: 32 }}>Oyun başlatılamadı</h1>
        <p style={{ opacity: 0.78, lineHeight: 1.6 }}>Grafik veya runtime başlatılırken bir hata oluştu. Oyun boş siyah ekran yerine güvenli hata ekranına geçti.</p>
        <code style={{ display: 'block', margin: '16px 0', padding: 12, overflow: 'auto', background: '#0b0806', color: '#d9cfb4', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{error.message || String(error)}</code>
        <button type="button" onClick={onRetry} style={{ border: '1px solid #8a4a2a', background: '#2a1608', color: '#ffe9d2', padding: '11px 18px', cursor: 'pointer', fontWeight: 800 }}>YENİDEN DENE</button>
      </section>
    </main>
  )
}

function GraphicsRecoveryScreen({ onReload }: { onReload: () => void }) {
  return (
    <main role="status" aria-live="polite" style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'grid', placeItems: 'center', padding: 24, boxSizing: 'border-box', background: 'rgba(11,8,6,.94)', color: '#f4eadf', fontFamily: 'system-ui, sans-serif' }}>
      <section style={{ width: 'min(620px, 100%)', padding: 28, border: '1px solid #5a3a22', background: '#16100c', boxShadow: '0 0 50px rgba(0,0,0,.45)', textAlign: 'center' }}>
        <div style={{ color: '#ff8a3d', letterSpacing: '.22em', fontSize: 12, fontWeight: 800 }}>GRAFİK BAĞLAMI</div>
        <h1 style={{ margin: '10px 0 8px', fontSize: 28 }}>Grafikler yeniden bağlanıyor…</h1>
        <p style={{ margin: '0 auto 18px', maxWidth: 520, opacity: 0.78, lineHeight: 1.6 }}>GPU bağlamı kısa süreli olarak kayboldu. Tarayıcı bağlamı geri getirirse oyun otomatik olarak devam edecektir.</p>
        <button type="button" onClick={onReload} style={{ border: '1px solid #8a4a2a', background: '#2a1608', color: '#ffe9d2', padding: '11px 18px', cursor: 'pointer', fontWeight: 800 }}>SAHNEYİ YENİDEN BAŞLAT</button>
      </section>
    </main>
  )
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }
  static getDerivedStateFromError(error: Error): State { return { error } }
  componentDidCatch(error: Error, info: unknown) { console.error('[ANATHEMA] React bootstrap error', error, info) }
  render() {
    if (this.state.error) return <CrashScreen error={this.state.error} onRetry={() => window.location.reload()} />
    return this.props.children
  }
}

function RuntimeGuardInner({ children }: Props) {
  const [fatal, setFatal] = useState<Error | null>(null)
  const [graphicsLost, setGraphicsLost] = useState(false)
  const fatalRef = useRef(false)

  useEffect(() => {
    let disposed = false
    let observer: MutationObserver | null = null
    const cleanups: Array<() => void> = []
    const fail = (error: Error) => {
      if (disposed || fatalRef.current) return
      fatalRef.current = true
      setFatal(error)
    }
    const onError = (event: ErrorEvent) => {
      const msg = event.message || (event.error instanceof Error ? event.error.message : String(event.error ?? ''))
      if (msg.includes('ResizeObserver') || msg.includes('Script error')) {
        return
      }
      console.error('[ANATHEMA] Uncaught runtime error', event.error ?? event.message)
    }
    const onRejection = (event: PromiseRejectionEvent) => {
      console.warn('[ANATHEMA] Unhandled promise rejection intercepted:', event.reason)
      event.preventDefault?.()
    }

    const onContextLost = (event: Event) => {
      event.preventDefault()
      console.warn('[ANATHEMA] WebGL context lost; waiting for browser restoration')
      setGraphicsLost(true)
    }
    const onContextRestored = () => {
      console.info('[ANATHEMA] WebGL context restored')
      setGraphicsLost(false)
    }

    const bindCanvas = (canvas: HTMLCanvasElement | null) => {
      if (!canvas) return
      canvas.addEventListener('webglcontextlost', onContextLost)
      canvas.addEventListener('webglcontextrestored', onContextRestored)
      cleanups.push(() => canvas.removeEventListener('webglcontextlost', onContextLost))
      cleanups.push(() => canvas.removeEventListener('webglcontextrestored', onContextRestored))
    }

    const rootCanvas = document.querySelector('canvas') as HTMLCanvasElement | null
    if (rootCanvas) bindCanvas(rootCanvas)
    else {
      observer = new MutationObserver(() => {
        const canvas = document.querySelector('canvas') as HTMLCanvasElement | null
        if (!canvas) return
        bindCanvas(canvas)
        observer?.disconnect()
        observer = null
      })
      observer.observe(document.body, { childList: true, subtree: true })
    }

    const testCanvas = document.createElement('canvas')
    const gl = testCanvas.getContext('webgl2') ?? testCanvas.getContext('webgl') ?? testCanvas.getContext('experimental-webgl')
    if (!gl) fail(new Error('Bu tarayıcıda kullanılabilir WebGL desteği bulunamadı.'))

    const watchdog = window.setTimeout(() => {
      if (!document.querySelector('canvas')) fail(new Error('3D sahne zamanında oluşturulamadı.'))
    }, 9000)

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      disposed = true
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
      window.clearTimeout(watchdog)
      observer?.disconnect()
      for (const cleanup of cleanups) cleanup()
    }
  }, [])

  if (fatal) return <CrashScreen error={fatal} onRetry={() => window.location.reload()} />
  if (graphicsLost) return <><>{children}</><GraphicsRecoveryScreen onReload={() => window.location.reload()} /></>
  return <>{children}</>
}

export default class BootGuard extends Component<Props, State> {
  state: State = { error: null }
  render() { return <ErrorBoundary><RuntimeGuardInner>{this.props.children}</RuntimeGuardInner></ErrorBoundary> }
}
