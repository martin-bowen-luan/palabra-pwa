export interface ViewportSample { layoutHeight: number; visualHeight?: number; offsetTop?: number; scale?: number }
export interface StudyViewport { height: number; top: number; compact: boolean; mode: 'bounded' | 'flow' }
export function measureStudyViewport(sample: ViewportSample): StudyViewport {
  const height = Number.isFinite(sample.visualHeight) && sample.visualHeight! > 0 ? sample.visualHeight! : Math.max(1, sample.layoutHeight || 1)
  const top = Number.isFinite(sample.offsetTop) ? Math.max(0, sample.offsetTop!) : 0
  const scale = sample.scale ?? 1
  return {height, top, compact:height < 600, mode:height < 320 || scale < .95 || scale > 1.05 ? 'flow' : 'bounded'}
}
