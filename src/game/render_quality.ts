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
        dprMin: 0.72,
        dprMax: 1.0,
        antialias: false,
        shadowMapSize: 1024,
        shadowType: THREE.PCFSoftShadowMap,
        exposure: 1.02,
        pixelRatioScale: 0.9,
        particleUpdateHz: 45,
        environmentDensity: 0.72,
      }
    case 'high':
      return {
        dprMin: 0.95,
        dprMax: 1.85,
        antialias: true,
        shadowMapSize: p > 0.7 ? 1536 : 2048,
        shadowType: THREE.PCFSoftShadowMap,
        exposure: 1.1,
        pixelRatioScale: 1,
        particleUpdateHz: 60,
        environmentDensity: 1,
      }
    case 'balanced':
      return {
        dprMin: 0.82,
        dprMax: 1.45,
        antialias: true,
        shadowMapSize: 1536,
        shadowType: THREE.PCFSoftShadowMap,
        exposure: 1.07,
        pixelRatioScale: 0.96,
        particleUpdateHz: 60,
        environmentDensity: 0.9,
      }
    case 'auto':
    default:
      return {
        dprMin: 0.78,
        dprMax: p < 0.28 ? 1.65 : p < 0.58 ? 1.4 : 1.15,
        antialias: p < 0.72,
        shadowMapSize: p < 0.3 ? 2048 : p < 0.65 ? 1536 : 1024,
        shadowType: THREE.PCFSoftShadowMap,
        exposure: 1.07,
        pixelRatioScale: 1 - p * 0.08,
        particleUpdateHz: p > 0.7 ? 30 : 60,
        environmentDensity: 1 - p * 0.22,
      }
  }
}
