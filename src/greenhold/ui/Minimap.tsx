"use client";

import { useEffect, useRef } from "react";
import { piece } from "../model/pieces";
import { N, idx } from "../model/world";
import { useStoreRef } from "./context";

const S = 1.6;
const W = Math.ceil(N * 2 * S);
const H = Math.ceil(N * S) + 2;
const GROUND: Record<string, string> = {
  grass: "#8dc85b",
  sand: "#ead69c",
  water: "#4ea8d9",
  road: "#5f646b",
  path: "#cdb98f",
  bike: "#5aa36a",
  plaza: "#e4dccb",
  rail: "#7d6f60",
  field: "#d6ad4a",
};

function colourOf(top: string): string {
  const p = piece(top);
  if (p.id === "townhall") return "#ffffff";
  if (p.id === "coal") return "#2b2b2b";
  if (p.cat === "power") return "#2f6fd6";
  if (p.cat === "town" || p.id === "station") return "#f2b630";
  if (p.kind === "nature") return p.id === "rock" ? "#9ea3a6" : "#3d7a3a";
  if (p.cat === "farms") return "#7fbf3f";
  return "#c4593b";
}

/** A small overview of the whole map: tap it to jump there. */
export function Minimap() {
  const store = useStoreRef();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const draw = () => {
      const c = ref.current;
      const ctx = c?.getContext("2d");
      if (!c || !ctx) return;
      const t = store.town;
      const air = store.sim.air;
      ctx.clearRect(0, 0, W, H);
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const col = t.cols[idx(x, y)];
          const px = (x - y) * S + W / 2;
          const py = (x + y) * (S / 2) + 1;
          ctx.fillStyle = col.s.length ? colourOf(col.s[col.s.length - 1]) : GROUND[col.g];
          ctx.fillRect(px - S, py, S * 2, S);
          const a = air[idx(x, y)];
          if (a > 4) {
            ctx.fillStyle = `rgba(150,110,60,${Math.min(0.7, a / 40)})`;
            ctx.fillRect(px - S, py, S * 2, S);
          }
        }
      // The view.
      const corners = store.viewTiles?.();
      if (corners) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        corners.forEach((p, k) => {
          const px = (p.x - p.y) * S + W / 2;
          const py = (p.x + p.y) * (S / 2) + 1;
          if (k) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        });
        ctx.closePath();
        ctx.stroke();
      }
    };
    draw();
    const id = window.setInterval(draw, 700);
    return () => window.clearInterval(id);
  }, [store]);

  const jump = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - r.left) / r.width) * W - W / 2;
    const my = ((e.clientY - r.top) / r.height) * H - 1;
    // Invert the minimap projection back to a tile.
    const gx = Math.round((my / (S / 2) + mx / S) / 2);
    const gy = Math.round((my / (S / 2) - mx / S) / 2);
    if (gx >= 0 && gy >= 0 && gx < N && gy < N) store.bus.emit("focus", { i: idx(gx, gy) });
  };

  return (
    <div className="gh-minimap">
      <canvas ref={ref} width={W} height={H} onPointerDown={jump} aria-label="Map of the whole world. Tap to move there." role="img" />
    </div>
  );
}
