import * as THREE from 'three'
import type { QualityPreset } from './profile'

export interface RenderQuality {
  dprMin: number
  dprMax: number
  antialias: boolean
  shadowMapSize: number
  shadowType: THREE.ShadowMapType
  exposure: number
  pixelRatioScale: number
  particleUpdateHz: number
  environmentDensity: number
}

export function resolveRenderQuality(mode: QualityPreset, pressure: number): RenderQuality {
  const p = THREE.MathUtils.clamp(Number.isFinite(pressure) ? pressure : 0, 0, 1)

  switch (mode) {
    case 'low':
      return {
        dprMin: 0.68,
        dprMax: 0.95,
        antialias: false,
        shadowMapSize: 768,
        shadowType: THREE.PCFShadowMap,
        exposure: 0.98,
        pixelRatioScale: 0.86,
        particleUpdateHz: 30,
        environmentDensity: 0.62,
      }
    case 'high':
      return {
        dprMin: 0.9,
        dprMax: 1.75,
        antialias: true,
        shadowMapSize: p > 0.72 ? 1536 : 2048,
        shadowType: THREE.PCFSoftShadowMap,
        exposure: 1.06,
        pixelRatioScale: 1,
        particleUpdateHz: p > 0.82 ? 45 : 60,
        environmentDensity: 1,
      }
    case 'balanced':
      return {
        dprMin: 0.8,
        dprMax: 1.5,
        antialias: true,
        shadowMapSize: p > 0.72 ? 1024 : 1536,
        shadowType: THREE.PCFSoftShadowMap,
        exposure: 1.03,
        pixelRatioScale: 0.97,
        particleUpdateHz: p > 0.8 ? 45 : 60,
        environmentDensity: 0.92,
      }
    case 'auto':
    default:
      return {
        dprMin: 0.76,
        dprMax: p < 0.22 ? 1.65 : p < 0.52 ? 1.45 : p < 0.76 ? 1.25 : 1.05,
        antialias: p < 0.78,
        shadowMapSize: p < 0.24 ? 2048 : p < 0.58 ? 1536 : 1024,
        shadowType: THREE.PCFSoftShadowMap,
        exposure: 1.04 - p * 0.04,
        pixelRatioScale: 1 - p * 0.1,
        particleUpdateHz: p > 0.78 ? 30 : p > 0.55 ? 45 : 60,
        environmentDensity: 1 - p * 0.25,
      }
  }
}
