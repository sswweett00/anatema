import { Component, memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrthographicCamera } from '@react-three/drei'
import { onPhase, setPhase, resetRun, gameState, enemies, type Phase } from './ecs/world'
import { initAudio, sfx } from './game/audio'
import { resetAbilities } from './game/abilities'
import { loadProfile, recordRun, type Profile, type QualityPreset } from './game/profile'
import { PerformanceController, type PerformanceSnapshot } from './game/performance'
import { resetRunDirector, startRunDirector } from './game/mechanics'
import { resetAdvancedRuntime, startAdvancedRuntime } from './game/advanced_runtime'
import { resetMegaSystemsV2, startMegaSystemsV2 } from './game/mega_systems_v2'
import { resetMegaCompletion, startMegaCompletion } from './game/mega_completion'
import { resetCombatPolish, startCombatPolish } from './game/combat_polish'
import { resetRuntimeSafety, startRuntimeSafety } from './game/runtime_safety'
import Environment from './components/Environment'
import Player from './components/Player'
import AbilityVFX from './components/AbilityVFX'
import EnemySwarm from './components/EnemySwarm'
import Weapons from './components/Weapons'
import ActiveAbilities from './components/ActiveAbilities'
import Glows from './components/Glows'
import Particles from './components/Particles'
import HUD from './components/HUD'
import CombatStatus from './components/CombatStatus'
import DamageNumbers from './components/DamageNumbers'
import ProfilePanel from './components/ProfilePanel'
import { StartScreen, DeathScreen, PauseScreen, LevelUpScreen } from './components/Screens'

const Scene = memo(function Scene({ quality, onPerformance }: { quality: QualityPreset; onPerformance: (snapshot: PerformanceSnapshot) => void }) {
  const controller = useRef(new PerformanceController(quality))
  const lastReport = useRef(0)
  const controllerQuality = useRef(quality)

  useEffect(() => {
    if (controllerQuality.current !== quality) {
      controller.current = new PerformanceController(quality)
      controllerQuality.current = quality
      lastReport.current = 0
    }
  }, [quality])

  useFrame((_, dt) => {
    const snapshot = controller.current.sample(dt, enemies.entities.length)
    lastReport.current += dt
    if (lastReport.current >= 0.5) {
      lastReport.current = 0
      onPerformance(snapshot)
    }
  })

  return (
    <>
      <color attach="background" args={['#241a11']} />
      <fog attach="fog" args={['#241a11', 40, 140]} />
      <OrthographicCamera makeDefault position={[26, 26, 26]} zoom={42} near={-300} far={500} />
      <Environment />
      <Glows />
      <Player />
      <AbilityVFX />
      <EnemySwarm />
      <Weapons />
      <ActiveAbilities />
      <Particles />
    </>
  )
})

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
            <h1 className="font-display mt-3 text-4xl font-black tracking-[0.1em] text-bone">BİR ŞEYLER KIRILDI</h1>
            <p className="mt-3 text-sm text-ash">Ayin beklenmedik bir şekilde söndü. Yeniden doğ ve kaldığın yerden devam et.</p>
            <button onClick={() => window.location.reload()} className="btn-rust font-display mt-7 inline-block px-10 py-3.5 text-base font-black tracking-[0.28em] text-[#ffe9d2]">YENİDEN DOĞ</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const [phase, setPh] = useState<Phase>('menu')
  const [profile, setProfile] = useState<Profile>(() => loadProfile())
  const [quality, setQualityState] = useState<QualityPreset>(() => loadProfile().quality)
  const [performance, setPerformance] = useState<PerformanceSnapshot>({
    fps: 60,
    frameMs: 16.7,
    pressure: 0,
    recommendedDpr: 1,
    particleScale: 0.7,
    enemyScale: 0.9,
  })
  const runRecorded = useRef(false)

  useEffect(() => {
    const stops = [
      startRunDirector(),
      startAdvancedRuntime(),
      startMegaSystemsV2(),
      startMegaCompletion(),
      startCombatPolish(),
      startRuntimeSafety(),
    ]
    return () => stops.forEach((stop) => stop())
  }, [])

  useEffect(() => onPhase((next) => {
    setPh(next)
    if (next === 'playing') runRecorded.current = false
    if (next === 'dead' && !runRecorded.current) {
      runRecorded.current = true
      setProfile(recordRun({
        kills: gameState.kills,
        level: gameState.level,
        maxCombo: gameState.maxCombo,
        duration: gameState.time,
        timestamp: Date.now(),
      }))
    }
  }), [])

  useEffect(() => {
    const onProfile = (event: Event) => {
      const next = (event as CustomEvent<Profile>).detail
      setProfile(next)
      setQualityState(next.quality)
    }
    window.addEventListener('anatema:profile', onProfile)
    return () => window.removeEventListener('anatema:profile', onProfile)
  }, [])

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
    resetRunDirector()
    resetAdvancedRuntime()
    resetMegaSystemsV2()
    resetMegaCompletion()
    resetCombatPolish()
    resetRuntimeSafety()
    resetAbilities()
    resetRun()
    sfx.start()
    setPhase('playing')
  }, [])

  const dpr: [number, number] = [performance.recommendedDpr, performance.recommendedDpr]

  return (
    <EmberBoundary>
      <div className="font-body text-bone bg-void relative h-dvh w-screen overflow-hidden">
        <Canvas shadows dpr={dpr} gl={{ antialias: performance.recommendedDpr >= 1, powerPreference: 'high-performance' }}>
          <Scene quality={quality} onPerformance={setPerformance} />
        </Canvas>
        <div className="vignette pointer-events-none absolute inset-0 z-10" />
        {import.meta.env.DEV && phase === 'playing' && (
          <div className="pointer-events-none absolute left-3 top-3 z-50 rounded bg-black/50 px-2 py-1 font-mono text-[10px] text-white/70">
            {Math.round(performance.fps)} FPS · {enemies.entities.length} ENEMIES · {quality.toUpperCase()} · {performance.recommendedDpr.toFixed(2)}× DPR
          </div>
        )}
        {(phase === 'playing' || phase === 'paused' || phase === 'levelup') && <HUD />}
        {phase === 'playing' && <CombatStatus />}
        {phase === 'playing' && <DamageNumbers />}
        {phase === 'menu' && <StartScreen onStart={start} />}
        {phase === 'menu' && <ProfilePanel />}
        {phase === 'dead' && <DeathScreen onRestart={start} />}
        {phase === 'paused' && <PauseScreen />}
        {phase === 'levelup' && <LevelUpScreen />}
      </div>
    </EmberBoundary>
  )
}
