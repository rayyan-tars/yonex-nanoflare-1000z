/** Canvas sizing + drawing helpers shared by every raster frame-sequence scene. */

const MAX_DPR = 2;

export function resizeCanvasForDPR(canvas: HTMLCanvasElement) {
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const cssWidth = canvas.clientWidth || window.innerWidth;
  const cssHeight = canvas.clientHeight || window.innerHeight;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
}

/** Cover-fit draw: fills the canvas, cropping overflow, image centered. */
export function drawCoverFrame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
) {
  if (!img.complete || !img.naturalWidth) return;

  const cw = canvas.width;
  const ch = canvas.height;
  const imgRatio = img.naturalWidth / img.naturalHeight;
  const canvasRatio = cw / ch;

  let drawW: number;
  let drawH: number;
  if (canvasRatio > imgRatio) {
    drawW = cw;
    drawH = cw / imgRatio;
  } else {
    drawH = ch;
    drawW = ch * imgRatio;
  }

  const drawX = (cw - drawW) / 2;
  const drawY = (ch - drawH) / 2;

  ctx.clearRect(0, 0, cw, ch);
  ctx.drawImage(img, drawX, drawY, drawW, drawH);
}

/** Returns the nearest loaded frame at or before `index`, or -1 if none are ready yet. */
export function nearestLoadedFrame(frames: HTMLImageElement[], index: number) {
  if (frames[index]?.complete && frames[index]?.naturalWidth) return index;
  for (let offset = 1; offset < frames.length; offset++) {
    const before = index - offset;
    const after = index + offset;
    if (before >= 0 && frames[before]?.complete && frames[before]?.naturalWidth) return before;
    if (after < frames.length && frames[after]?.complete && frames[after]?.naturalWidth) return after;
  }
  return -1;
}
