import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { abilities, type AbilityId, ABILITIES, MEND_DEF } from '../game/abilities'
import { getPlayer, gameState } from '../ecs/world'

const IDS = [...new Set([...ABILITIES.map((ability) => ability.id), MEND_DEF.id])] as AbilityId[]
const ACTIVE = new Set<AbilityId>([
  'arrows','nova','orbit','chain','storm','frost','vortex','spikes','pyre','phantom','venom',
  'meteor','gravitywell','soulbolts','bladestorm','arcanemine','bloodnova','voidrift','mirrors','wolfpack','seismic','runeprison','frostfire',
])

const PALETTE: Partial<Record<AbilityId, number>> = {
  steel:0xffb15c, arrows:0xffd08a, nova:0xff7138, orbit:0xffa14d, chain:0x7ad7ff, storm:0xc9eaff,
  frost:0x8fd8ff, vortex:0xff8f47, spikes:0xd0ad80, pyre:0xff6330, phantom:0xcfe4ff, venom:0x72e089,
  heart:0xff5d52, swift:0xffc66f, armor:0xb8a28a, crit:0xffe8a0, magnet:0x9fddff, rage:0xd52e38,
  vamp:0xb32b42, stone:0x8f8070, ghoststep:0xa9a5ff, ferocity:0xf0a05a, thorns:0x8cae63,
  laststand:0xffefaf, focus:0x8fd2ff, momentum:0xf2b871, adrenaline:0xff6a52, bulwark:0xc7b18c,
  greed:0xffd15e, harvest:0x77c58a, scholar:0x7fc8ff, warlord:0xcfa1ff, mend:0x7de0a4,
  meteor:0xffc56e, gravitywell:0x7c4dbe, soulbolts:0xb7a1ff, bladestorm:0xe6eefc, arcanemine:0xc88cff,
  bloodnova:0xc92c46, voidrift:0x5d39a2, mirrors:0xd4ecff, wolfpack:0x9dbad6, seismic:0xc1a179,
  runeprison:0x9a6ce3, frostfire:0x9eeaff, ward:0x82d8ff, overcharge:0x73c8ff, executioner:0xff5366,
  berserker:0xe54936, resilience:0xbeb2a4, siphon:0x8e6fe0, evasion:0xb69bff, precision:0xffe4a2,
  conduit:0x83ffd1, detonation:0xffa15a, fortunesfavor:0xffd965, lifeforge:0xff8b62, aegis:0xbad5ff,
  hemocraft:0xb81f3a, celerity:0x91f6df, deathsmark:0x7b2c44, soulharvest:0xc8a2ff,
}
const FALLBACK_PALETTE = 0xc8b7a6
const PROFILE: Partial<Record<AbilityId, { radius: number; height: number; speed: number }>> = {
  meteor:{radius:3.0,height:1.2,speed:1.0}, gravitywell:{radius:3.1,height:0.25,speed:0.8}, soulbolts:{radius:2.0,height:0.9,speed:3.0},
  bladestorm:{radius:3.0,height:0.8,speed:3.5}, arcanemine:{radius:1.5,height:0.08,speed:0.7}, bloodnova:{radius:2.5,height:0.18,speed:1.8},
  voidrift:{radius:2.9,height:0.1,speed:1.1}, mirrors:{radius:2.2,height:1.0,speed:2.8}, wolfpack:{radius:2.4,height:0.65,speed:2.4},
  seismic:{radius:3.2,height:0.12,speed:1.4}, runeprison:{radius:2.6,height:1.1,speed:1.0}, frostfire:{radius:2.8,height:0.22,speed:1.7},
  ward:{radius:1.3,height:0.8,speed:0.5}, overcharge:{radius:1.55,height:0.65,speed:2.6}, executioner:{radius:1.4,height:0.7,speed:1.5},
  berserker:{radius:1.7,height:0.55,speed:2.7}, resilience:{radius:1.25,height:0.35,speed:0.4}, siphon:{radius:1.45,height:0.65,speed:1.2},
  evasion:{radius:1.6,height:0.42,speed:3.2}, precision:{radius:1.3,height:0.72,speed:1.8}, conduit:{radius:1.9,height:0.8,speed:2.2},
  detonation:{radius:1.55,height:0.35,speed:2.0}, fortunesfavor:{radius:1.45,height:0.8,speed:0.9}, lifeforge:{radius:1.35,height:0.65,speed:0.7},
  aegis:{radius:1.5,height:0.95,speed:0.45}, hemocraft:{radius:1.6,height:0.5,speed:1.3}, celerity:{radius:1.55,height:0.35,speed:3.2},
  deathsmark:{radius:1.25,height:0.7,speed:0.65}, soulharvest:{radius:1.8,height:0.9,speed:1.6},
}
const DEFAULT_PROFILE = { radius:1.35, height:0.45, speed:1.0 }
const ringGeo = new THREE.TorusGeometry(1,0.03,8,48)
const coreGeo = new THREE.OctahedronGeometry(0.09,0)

function fallbackColor(id: AbilityId): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return ((h & 0xff) << 16) | (((h >>> 8) & 0xff) << 8) | ((h >>> 16) & 0xff)
}

export default function AbilityFieldVFX() {
  const rings = useRef<THREE.InstancedMesh>(null!)
  const cores = useRef<THREE.InstancedMesh>(null!)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(), [])
  const initializedColors = useRef(false)
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent:true, opacity:0.7, toneMapped:false, blending:THREE.AdditiveBlending, depthWrite:false }), [])
  const coreMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent:true, opacity:0.9, toneMapped:false, blending:THREE.AdditiveBlending, depthWrite:false }), [])

  useFrame((state) => {
    const player = getPlayer()
    if (!player) return
    const t = state.clock.elapsedTime
    const moving = Math.hypot(player.velocity.x, player.velocity.z)
    const combo = Math.min(1, gameState.combo / 40)
    for (let i = 0; i < IDS.length; i++) {
      const id = IDS[i]
      const level = abilities[id]
      if (level <= 0) {
        dummy.position.copy(player.position)
        dummy.scale.setScalar(0)
        dummy.rotation.set(0,0,0)
        dummy.updateMatrix()
        rings.current.setMatrixAt(i,dummy.matrix); cores.current.setMatrixAt(i,dummy.matrix)
        continue
      }
      const p = PROFILE[id] ?? DEFAULT_PROFILE
      const angle = t * p.speed + i * (Math.PI * 2 / IDS.length)
      const slot = 1.8 + (i % 5) * 0.62
      const lx = Math.cos(angle) * slot
      const lz = Math.sin(angle) * slot
      const levelScale = 1 + Math.min(3.2, level * 0.075)
      const active = ACTIVE.has(id)
      const pulse = 1 + Math.sin(t * (3.2 + p.speed) + i) * 0.045
      const boost = active ? 1 + combo * 0.22 + moving * 0.018 : 0.82 + combo * 0.08
      dummy.position.set(player.position.x+lx,0.06+p.height*0.28+Math.sin(t*p.speed+i)*0.035,player.position.z+lz)
      dummy.rotation.set(Math.PI*0.5,angle*0.3,angle)
      dummy.scale.setScalar(p.radius*levelScale*pulse*boost)
      dummy.updateMatrix(); rings.current.setMatrixAt(i,dummy.matrix)
      dummy.position.set(player.position.x+lx,p.height+0.18+Math.sin(t*p.speed+i)*0.08,player.position.z+lz)
      dummy.rotation.set(t*p.speed,angle,-t*0.7)
      dummy.scale.setScalar((0.65+Math.min(2.2,level*0.055))*(active?1.15:0.8)*(1+Math.sin(t*5.5+i)*0.12))
      dummy.updateMatrix(); cores.current.setMatrixAt(i,dummy.matrix)
      if (!initializedColors.current) { color.setHex(PALETTE[id] ?? fallbackColor(id) ?? FALLBACK_PALETTE); rings.current.setColorAt(i,color); cores.current.setColorAt(i,color) }
    }
    if (!initializedColors.current) { initializedColors.current=true; if (rings.current.instanceColor) rings.current.instanceColor.needsUpdate=true; if (cores.current.instanceColor) cores.current.instanceColor.needsUpdate=true }
    rings.current.instanceMatrix.needsUpdate=true
    cores.current.instanceMatrix.needsUpdate=true
  })

  return <group><instancedMesh ref={rings} args={[ringGeo,ringMat,IDS.length]} frustumCulled={false}/><instancedMesh ref={cores} args={[coreGeo,coreMat,IDS.length]} frustumCulled={false}/></group>
}
