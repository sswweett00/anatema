import { memo, useCallback, useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrthographicCamera } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import { onPhase, setPhase, resetRun, gameState, type Phase } from './ecs/world'
import { initAudio, sfx } from './game/audio'
import { resetAbilities } from './game/abilities'
import Environment from './components/Environment'
import Player from './components/Player'
import EnemySwarm from './components/EnemySwarm'
import Weapons from './components/Weapons'
import ActiveAbilities from './components/ActiveAbilities'
import Particles from './components/Particles'
import HUD from './components/HUD'
import { StartScreen, DeathScreen, PauseScreen, LevelUpScreen } from './components/Screens'

/*
 * Sahne bileşeni memo'lanır: faz değişimlerinde App yeniden render olsa
 * bile 3D ağaç asla yeniden kurulmaz. Oyun durumu tamamen ECS'tedir.
 */
const Scene = memo(function Scene() {
  return (
    <>
      <color attach="background" args={['#1a140e']} />
      <fog attach="fog" args={['#1a140e', 34, 120]} />
      <OrthographicCamera makeDefault position={[26, 26, 26]} zoom={42} near={-300} far={500} />
      <Environment />
      <Player />
      <EnemySwarm />
      <Weapons />
      <ActiveAbilities />
      <Particles />
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <Bloom
          mipmapBlur
          intensity={0.85}
          luminanceThreshold={0.32}
          luminanceSmoothing={0.2}
          radius={0.72}
        />
        <Vignette eskil={false} offset={0.24} darkness={0.82} />
      </EffectComposer>
    </>
  )
})

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
    initAudio()
    resetAbilities()
    resetRun()
    sfx.start()
    setPhase('playing')
  }, [])

  return (
    <div className="font-body text-bone bg-void relative h-dvh w-screen overflow-hidden">
      <Canvas
        shadows
        dpr={[1, 1.75]}
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
  )
}
