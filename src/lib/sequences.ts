/**
 * Frame-sequence configuration for the cinematic canvas scenes.
 *
 * When `frameCount` is 0, scenes fall back to the static RacketPhoto
 * cutouts in public/nanoflare/stills/ instead of a raster canvas — see
 * ASSETS.md for exactly how to drop in a real frame sequence and activate it.
 */

export type SequenceConfig = {
  id: string;
  /** Public folder the frames live in, e.g. "/nanoflare/hero" */
  basePath: string;
  /** Total frames named frame_0001.webp ... frame_{frameCount}.webp */
  frameCount: number;
  extension: "webp" | "jpg" | "avif";
  /** Portion of frames (0-1) to preload with high priority before the scene is considered ready. */
  priorityFraction: number;
};

export const HERO_SEQUENCE: SequenceConfig = {
  id: "hero",
  basePath: "/nanoflare/hero",
  frameCount: 0,
  extension: "webp",
  priorityFraction: 0.18,
};

export const SPEED_SEQUENCE: SequenceConfig = {
  id: "speed",
  basePath: "/nanoflare/technology",
  frameCount: 0,
  extension: "webp",
  priorityFraction: 0.25,
};

export const framePath = (sequence: SequenceConfig, n: number) =>
  `${sequence.basePath}/frame_${String(n).padStart(4, "0")}.${sequence.extension}`;
