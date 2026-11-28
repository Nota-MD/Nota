/** Thresholds for optional long-document work. */

export const viewportHydrationThreshold = 100_000;

export const featurePauseThreshold = 1_500_000;

export function shouldHydrateNearViewport(contentSize: number): boolean {
  return Number.isFinite(contentSize) && contentSize > viewportHydrationThreshold;
}

export function shouldPauseOptionalFeatures(contentSize: number): boolean {
  return Number.isFinite(contentSize) && contentSize > featurePauseThreshold;
}
