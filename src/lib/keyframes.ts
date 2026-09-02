export type Keyframe = [progress: number, value: number];

/** Piecewise-linear interpolation across sorted (progress, value) stops — the non-linear scroll-pacing tool used by every cinematic scene. */
export function interpolate(progress: number, stops: Keyframe[]): number {
  if (stops.length === 0) return 0;
  if (progress <= stops[0][0]) return stops[0][1];
  for (let i = 0; i < stops.length - 1; i++) {
    const [p0, v0] = stops[i];
    const [p1, v1] = stops[i + 1];
    if (progress >= p0 && progress <= p1) {
      const t = p1 === p0 ? 1 : (progress - p0) / (p1 - p0);
      return v0 + (v1 - v0) * t;
    }
  }
  return stops[stops.length - 1][1];
}

/** Opacity for a text/label band that fades in at `show` and out at `hide`, with a short crossfade edge. */
export function bandOpacity(progress: number, show: number, hide: number, fade = 0.03) {
  if (progress < show - fade || progress > hide + fade) return 0;
  return interpolate(progress, [
    [show - fade, 0],
    [show, 1],
    [hide, 1],
    [hide + fade, 0],
  ]);
}
