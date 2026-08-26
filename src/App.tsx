import { Component, memo, useCallback, useEffect, useState, type ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrthographicCamera } from '@react-three/drei'
import { onPhase, setPhase, resetRun, gameState, type Phase } from './ecs/world'
import { initAudio, sfx } from './game/audio'
import { resetAbilities } from './game/abilities'
import Environment from './components/Environment'
import Player from './components/Player'
import EnemySwarm from './components/EnemySwarm'
import Weapons from './components/Weapons'
import ActiveAbilities from './components/ActiveAbilities'
import Glows from './components/Glows'
import Particles from './components/Particles'
import HUD from './components/HUD'
import { StartScreen, DeathScreen, PauseScreen, LevelUpScreen } from './components/Screens'

/*
 * Sahne bileşeni memo'lanır: faz değişimlerinde App yeniden render olsa
 * bile 3D ağaç asla yeniden kurulmaz. Oyun durumu tamamen ECS'tedir.
 * Parıltı efektleri sahne içi additif materyallerle yapılır —
 * compositor yok, her WebGL bağlamında garantili çalışır.
 */
const Scene = memo(function Scene() {
  return (
    <>
      <color attach="background" args={['#241a11']} />
      <fog attach="fog" args={['#241a11', 40, 140]} />
      <OrthographicCamera makeDefault position={[26, 26, 26]} zoom={42} near={-300} far={500} />
      <Environment />
      <Glows />
      <Player />
      <EnemySwarm />
      <Weapons />
      <ActiveAbilities />
      <Particles />
    </>
  )
})

/* ---------------- hata emniyeti: ekran asla kararmaz ---------------- */

class EmberBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(err: unknown) {
    console.error('ANATHEMA — beklenmedik hata:', err)
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="font-body bg-void text-bone flex h-dvh w-screen items-center justify-center">
          <div className="fade-rise mx-4 max-w-md text-center">
            <div className="text-[11px] font-bold tracking-[0.5em] text-rust">KÜLLER SAVRULDU</div>
            <h1 className="font-display mt-3 text-4xl font-black tracking-[0.1em] text-bone">
              BİR ŞEYLER KIRILDI
            </h1>
            <p className="mt-3 text-sm text-ash">
              Ayin beklenmedik bir şekilde söndü. Yeniden doğ ve kaldığın yerden devam et.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="btn-rust font-display mt-7 inline-block px-10 py-3.5 text-base font-black tracking-[0.28em] text-[#ffe9d2]"
            >
              YENİDEN DOĞ
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const [phase, setPh] = useState<Phase>('menu')

  /* faz değişimleri ECS'ten gelir — tek re-render noktası burası */
  useEffect(() => onPhase(setPh), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyP' || e.code === 'Escape') {
        if (gameState.phase === 'playing') setPhase('paused')
        else if (gameState.phase === 'paused') setPhase('playing')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const start = useCallback(() => {
    try {
      initAudio()
    } catch (err) {
      console.warn('Ses başlatılamadı (oyun sessiz devam eder):', err)
    }
    resetAbilities()
    resetRun()
    sfx.start()
    setPhase('playing')
  }, [])

  return (
    <EmberBoundary>
      <div className="font-body text-bone bg-void relative h-dvh w-screen overflow-hidden">
        <Canvas
          shadows
          dpr={[1, 1.5]}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
        >
          <Scene />
        </Canvas>

        {/* sinematik vinyet */}
        <div className="vignette pointer-events-none absolute inset-0 z-10" />

        {(phase === 'playing' || phase === 'paused' || phase === 'levelup') && <HUD />}
        {phase === 'menu' && <StartScreen onStart={start} />}
        {phase === 'dead' && <DeathScreen onRestart={start} />}
        {phase === 'paused' && <PauseScreen />}
        {phase === 'levelup' && <LevelUpScreen />}
      </div>
    </EmberBoundary>
  )
}
