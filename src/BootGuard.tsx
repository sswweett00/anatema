import { Component, useEffect, useState, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[ANATHEMA] React bootstrap error', error, info)
  }

  render() {
    if (this.state.error) return <CrashScreen error={this.state.error} onRetry={() => window.location.reload()} />
    return this.props.children
  }
}

function CrashScreen({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, boxSizing: 'border-box', background: '#0b0806', color: '#f4eadf', fontFamily: 'system-ui, sans-serif' }}>
      <section style={{ width: 'min(680px, 100%)', padding: 28, border: '1px solid #5a3a22', background: '#16100c', boxShadow: '0 0 50px rgba(0,0,0,.45)' }}>
        <div style={{ color: '#ff8a3d', letterSpacing: '.22em', fontSize: 12, fontWeight: 800 }}>ANATHEMA</div>
        <h1 style={{ margin: '10px 0 8px', fontSize: 32 }}>Oyun başlatılamadı</h1>
        <p style={{ opacity: 0.78, lineHeight: 1.6 }}>Grafik veya runtime başlatılırken bir hata oluştu. Oyun siyah ekranda kalmak yerine hata durumunu gösteriyor.</p>
        <code style={{ display: 'block', margin: '16px 0', padding: 12, overflow: 'auto', background: '#0b0806', color: '#d9cfb4', fontSize: 12 }}>{error.message || String(error)}</code>
        <button type="button" onClick={onRetry} style={{ border: '1px solid #8a4a2a', background: '#2a1608', color: '#ffe9d2', padding: '11px 18px', cursor: 'pointer', fontWeight: 800 }}>YENİDEN DENE</button>
      </section>
    </main>
  )
}

function RuntimeGuardInner({ children }: Props) {
  const [fatal, setFatal] = useState<Error | null>(null)

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      console.error('[ANATHEMA] Uncaught runtime error', event.error ?? event.message)
      setFatal(event.error instanceof Error ? event.error : new Error(event.message || 'Bilinmeyen runtime hatası'))
    }
    const onRejection = (event: PromiseRejectionEvent) => {
      console.error('[ANATHEMA] Unhandled promise rejection', event.reason)
      setFatal(event.reason instanceof Error ? event.reason : new Error(String(event.reason ?? 'Promise rejection')))
    }
    const onContextLost = (event: Event) => {
      event.preventDefault()
      setFatal(new Error('WebGL grafik bağlamı kayboldu. Tarayıcı GPU bağlamını yeniden başlatamadı.'))
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)

    const canvas = document.querySelector('canvas')
    canvas?.addEventListener('webglcontextlost', onContextLost, { once: true })

    const testCanvas = document.createElement('canvas')
    const webgl = testCanvas.getContext('webgl2') ?? testCanvas.getContext('webgl') ?? testCanvas.getContext('experimental-webgl')
    if (!webgl) {
      setFatal(new Error('Bu tarayıcıda kullanılabilir WebGL desteği bulunamadı.'))
    }

    const watchdog = window.setTimeout(() => {
      const appCanvas = document.querySelector('canvas')
      if (!appCanvas && !fatal) setFatal(new Error('3D sahne zamanında oluşturulamadı.'))
    }, 9000)

    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
      canvas?.removeEventListener('webglcontextlost', onContextLost)
      window.clearTimeout(watchdog)
    }
  }, [])

  if (fatal) return <CrashScreen error={fatal} onRetry={() => window.location.reload()} />
  return <>{children}</>
}

export default class BootGuard extends Component<Props, State> {
  state: State = { error: null }

  render() {
    return (
      <ErrorBoundary>
        <RuntimeGuardInner>{this.props.children}</RuntimeGuardInner>
      </ErrorBoundary>
    )
  }
}
