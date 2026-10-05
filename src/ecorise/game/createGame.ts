import Phaser from "phaser";
import { CityScene, type CitySceneDeps } from "./CityScene";

export interface GameHandle {
  destroy(): void;
}

/**
 * Creates the Phaser game inside `parent`. Browser-only: this module is
 * imported dynamically from a client component after mount.
 *
 * The canvas is rendered at up to 2 device pixels per CSS pixel (1 in
 * performance mode) and scaled down with CSS, so the art stays crisp on
 * high-density screens without unbounded fill cost.
 */
export function createGame(parent: HTMLElement, deps: Omit<CitySceneDeps, "resolution">): GameHandle {
  const resolution = deps.quality === "performance" ? 1 : Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const size = () => ({
    w: Math.max(1, Math.round(parent.clientWidth * resolution)),
    h: Math.max(1, Math.round(parent.clientHeight * resolution)),
  });
  const initial = size();

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    transparent: true,
    banner: false,
    audio: { noAudio: true },
    input: { keyboard: false, gamepad: false },
    render: { antialias: true, powerPreference: "high-performance" },
    scale: {
      mode: Phaser.Scale.NONE,
      width: initial.w,
      height: initial.h,
      zoom: 1 / resolution,
    },
  });
  game.scene.add("city", CityScene, true, { ...deps, resolution } satisfies CitySceneDeps);

  let raf = 0;
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const { w, h } = size();
      if (w !== game.scale.width || h !== game.scale.height) game.scale.resize(w, h);
    });
  });
  observer.observe(parent);

  let destroyed = false;
  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      observer.disconnect();
      cancelAnimationFrame(raf);
      game.destroy(true);
    },
  };
}
