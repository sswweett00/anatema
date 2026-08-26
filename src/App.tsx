import { Component, memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrthographicCamera } from '@react-three/drei'
import * as THREE from 'three'
import { onPhase, setPhase, resetRun, gameState, enemies, getPlayer, type Phase } from './ecs/world'
import { initAudio, sfx } from './game/audio'
import { resetAbilities } from './game/abilities'
import { loadProfile, recordRun, type Profile, type QualityPreset } from './game/profile'
import { PerformanceController, type PerformanceSnapshot } from './game/performance'
import { samplePerformance } from './game/performance_governor'
import { validateCombatContent } from './game/content_validation'
import { diagnosticsJson } from './game/diagnostics'
import { resetRuntimeSuite, startRuntimeSuite } from './game/runtime_suite'
import { resetGameServices } from './game/game_services'
import { saveRunSnapshot } from './game/run_snapshot'
import { CameraRig } from './game/camera_rig'
import { resolveRenderQuality } from './game/render_quality'
import Environment from './components/Environment'
import Player from './components/Player'
import AbilityVFX from './components/AbilityVFX'
import AbilityFieldVFX from './components/AbilityFieldVFX'
import EnemySwarm from './components/EnemySwarm'
import Weapons from './components/Weapons'
import ActiveAbilities from './components/ActiveAbilities'
import Glows from './components/Glows'
import Particles from './components/Particles'
import LootRenderer from './components/LootRenderer'
import HUD from './components/HUD'
import CombatStatus from './components/CombatStatus'
import CombatFeed from './components/CombatFeed'
import WorldStatus from './components/WorldStatus'
import DamageNumbers from './components/DamageNumbers'
import ProfilePanel from './components/ProfilePanel'
import { StartScreen, DeathScreen, PauseScreen, LevelUpScreen } from './components/Screens'

class SceneIslandBoundary extends Component<{ name: string; children: ReactNode }, { failed: boolean; message: string }> {
  state = { failed: false, message: '' }

  static getDerivedStateFromError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return { failed: true, message }
  }

  componentDidCatch(error: unknown) {
    console.error(`[ANATHEMA] scene island failed: ${this.props.name}`, error)
  }

  render() {
    if (this.state.failed) return null
    return this.props.children
  }
}

const Scene = memo(function Scene({ quality, onPerformance }: { quality: QualityPreset; onPerformance: (snapshot: PerformanceSnapshot) => void }) {
  const controller = useRef(new PerformanceController(quality))
  const cameraRig = useRef(new CameraRig())
  const lastReport = useRef(0)
  const controllerQuality = useRef(quality)
  const lastPhase = useRef(gameState.phase)

  useEffect(() => {
    if (controllerQuality.current !== quality) {
      controller.current = new PerformanceController(quality)
      controllerQuality.current = quality
      lastReport.current = 0
    }
  }, [quality])

  useFrame((state, dt) => {
    try {
      const safeDt = Math.min(0.05, Math.max(0.001, dt))
      const snapshot = controller.current.sample(safeDt, enemies.entities.length)
      samplePerformance(snapshot.fps, safeDt)
      lastReport.current += safeDt

      const camera = state.camera as THREE.OrthographicCamera
      const player = getPlayer()
      if (lastPhase.current !== gameState.phase) {
        lastPhase.current = gameState.phase
        if (gameState.phase === 'playing' || gameState.phase === 'menu') cameraRig.current.reset(camera)
      }

      if (player) {
        cameraRig.current.addImpact(Math.min(1, Math.max(0, gameState.shake)))
        cameraRig.current.update(camera, player, safeDt, snapshot.pressure)
      }

      if (lastReport.current >= 0.5) {
        lastReport.current = 0
        onPerformance(snapshot)
      }
    } catch (error) {
      console.error('[ANATHEMA] performance/camera frame failed', error)
    }
  })

  return (
    <>
      <color attach="background" args={['#20150f']} />
      <fog attach="fog" args={['#20150f', 42, 155]} />
      <ambientLight intensity={0.32} color="#d7c3b0" />
      <OrthographicCamera makeDefault position={[26, 26, 26]} zoom={42} near={-300} far={500} />
      <SceneIslandBoundary name="environment"><Environment /></SceneIslandBoundary>
      <SceneIslandBoundary name="glows"><Glows /></SceneIslandBoundary>
      <SceneIslandBoundary name="player"><Player /></SceneIslandBoundary>
      <SceneIslandBoundary name="ability-vfx"><AbilityVFX /></SceneIslandBoundary>
      <SceneIslandBoundary name="ability-field-vfx"><AbilityFieldVFX /></SceneIslandBoundary>
      <SceneIslandBoundary name="enemy-swarm"><EnemySwarm /></SceneIslandBoundary>
      <SceneIslandBoundary name="weapons"><Weapons /></SceneIslandBoundary>
      <SceneIslandBoundary name="active-abilities"><ActiveAbilities /></SceneIslandBoundary>
      <SceneIslandBoundary name="particles"><Particles /></SceneIslandBoundary>
      <SceneIslandBoundary name="loot"><LootRenderer /></SceneIslandBoundary>
    </>
  )
})

class EmberBoundary extends Component<{ children: ReactNode }, { failed: boolean; message: string }> {
  state = { failed: false, message: '' }

  static getDerivedStateFromError(error: unknown) {
    return { failed: true, message: error instanceof Error ? error.message : String(error) }
  }

  componentDidCatch(err: unknown) {
    console.error('ANATHEMA — beklenmedik hata:', err)
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="font-body bg-void text-bone flex h-dvh w-screen items-center justify-center">
          <div className="fade-rise mx-4 max-w-xl text-center">
            <div className="text-[11px] font-bold tracking-[0.5em] text-rust">KÜLLER SAVRULDU</div>
            <h1 className="font-display mt-3 text-4xl font-black tracking-[0.1em] text-bone">BİR ŞEYLER KIRILDI</h1>
            <p className="mt-3 text-sm text-ash">Ayin beklenmedik bir şekilde söndü. Runtime hatası aşağıda.</p>
            <pre className="mt-4 max-h-44 overflow-auto rounded border border-white/10 bg-black/40 p-3 text-left text-xs text-[#ffd7bd] whitespace-pre-wrap">{this.state.message || 'Bilinmeyen React/Three.js hatası'}</pre>
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
  const [performance, setPerformance] = useState<PerformanceSnapshot>({ fps: 60, frameMs: 16.7, pressure: 0, recommendedDpr: 1, particleScale: 0.7, enemyScale: 0.9 })
  const runRecorded = useRef(false)

  useEffect(() => {
    const validation = validateCombatContent()
    if (!validation.valid) console.error('[ANATHEMA] combat content validation failed', validation.errors)
    return startRuntimeSuite()
  }, [])

  useEffect(() => onPhase((next) => {
    setPh(next)
    if (next === 'playing') runRecorded.current = false
    if (next === 'dead' && !runRecorded.current) {
      runRecorded.current = true
      saveRunSnapshot()
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

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const diagnostics = () => diagnosticsJson()
    ;(window as Window & { __ANATEMA_DIAGNOSTICS__?: () => string }).__ANATEMA_DIAGNOSTICS__ = diagnostics
    return () => { delete (window as Window & { __ANATEMA_DIAGNOSTICS__?: () => string }).__ANATEMA_DIAGNOSTICS__ }
  }, [])

  const start = useCallback(() => {
    try { initAudio() } catch (err) { console.warn('Ses başlatılamadı (oyun sessiz devam eder):', err) }
    resetGameServices()
    resetRuntimeSuite()
    resetAbilities()
    resetRun()
    sfx.start()
    setPhase('playing')
  }, [])

  const renderQuality = resolveRenderQuality(quality, performance.pressure)
  const baseDpr = Number.isFinite(performance.recommendedDpr) ? performance.recommendedDpr : 1
  const dprValue = Math.min(renderQuality.dprMax, Math.max(renderQuality.dprMin, baseDpr))
  const dpr: [number, number] = [dprValue * 0.94, dprValue]

  return (
    <EmberBoundary>
      <div className="font-body text-bone bg-void relative h-dvh w-screen overflow-hidden">
        <Canvas
          shadows="soft"
          dpr={dpr}
          gl={{
            antialias: renderQuality.antialias,
            alpha: false,
            depth: true,
            stencil: false,
            preserveDrawingBuffer: false,
            powerPreference: 'high-performance',
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: renderQuality.exposure,
          }}
          onCreated={({ gl }) => {
            gl.outputColorSpace = THREE.SRGBColorSpace
            gl.shadowMap.enabled = true
            gl.shadowMap.type = renderQuality.shadowType
          }}
        >
          <Scene quality={quality} onPerformance={setPerformance} />
        </Canvas>
        <div className="vignette pointer-events-none absolute inset-0 z-10" />
        {import.meta.env.DEV && phase === 'playing' && (
          <div className="pointer-events-none absolute left-3 top-3 z-50 rounded bg-black/50 px-2 py-1 font-mono text-[10px] text-white/70">
            {Math.round(performance.fps)} FPS · {enemies.entities.length} ENEMIES · {quality.toUpperCase()} · {dprValue.toFixed(2)}× DPR
          </div>
        )}
        {(phase === 'playing' || phase === 'paused' || phase === 'levelup') && <HUD />}
        {phase === 'playing' && <CombatStatus />}
        {phase === 'playing' && <CombatFeed />}
        {phase === 'playing' && <WorldStatus />}
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
