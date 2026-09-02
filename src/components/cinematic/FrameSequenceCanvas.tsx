"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import type { SequenceConfig } from "@/lib/sequences";
import { useFrameSequence } from "@/lib/useFrameSequence";
import { drawCoverFrame, nearestLoadedFrame, resizeCanvasForDPR } from "@/lib/canvasFrame";

export type FrameSequenceHandle = {
  /** Draw the frame nearest to this 0-1 progress value. No-op while sequence.frameCount is 0. */
  drawAt: (progress: number) => void;
};

type Props = {
  sequence: SequenceConfig;
  className?: string;
  onReady?: () => void;
};

/**
 * Raster frame-sequence renderer, ready for a real photographed/rendered
 * NANOFLARE sequence (see ASSETS.md). Renders nothing while
 * `sequence.frameCount` is 0 — the calling scene falls back to the static
 * RacketPhoto cutouts in that case, driven by the same progress value.
 */
export const FrameSequenceCanvas = forwardRef<FrameSequenceHandle, Props>(function FrameSequenceCanvas(
  { sequence, className, onReady },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastIndexRef = useRef(-1);
  const { framesRef, ready } = useFrameSequence(sequence);

  const draw = useCallback(
    (index: number) => {
      const canvas = canvasRef.current;
      const frames = framesRef.current;
      if (!canvas || !frames.length) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const resolved = nearestLoadedFrame(frames, index);
      if (resolved === -1) return;
      drawCoverFrame(ctx, canvas, frames[resolved]);
    },
    [framesRef],
  );

  useImperativeHandle(
    ref,
    () => ({
      drawAt: (progress: number) => {
        if (sequence.frameCount === 0) return;
        const index = Math.min(sequence.frameCount - 1, Math.floor(progress * sequence.frameCount));
        if (index === lastIndexRef.current) return;
        lastIndexRef.current = index;
        draw(index);
      },
    }),
    [draw, sequence.frameCount],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || sequence.frameCount === 0) return;
    const handleResize = () => {
      resizeCanvasForDPR(canvas);
      draw(lastIndexRef.current >= 0 ? lastIndexRef.current : 0);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [draw, sequence.frameCount]);

  useEffect(() => {
    if (ready && sequence.frameCount > 0) {
      draw(0);
      onReady?.();
    }
  }, [ready, draw, onReady, sequence.frameCount]);

  if (sequence.frameCount === 0) return null;

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ willChange: "contents", transform: "translateZ(0)" }}
    />
  );
});
