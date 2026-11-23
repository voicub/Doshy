/** Pre-rendered canvases the rain engine stamps every frame (left blank when the browser gives no 2D context, in which case the engine does not start either). */
function sprite(size: number, paint: (g: CanvasRenderingContext2D, s: number) => void): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (g) paint(g, size);
  return c;
}

/** One water drop seen through glass: faint body, dark upper rim, bright lower rim that "focuses" the scene, specular point. */
export const dropSprite = () =>
  sprite(64, (g, s) => {
    const c = s / 2;
    const r = c - 4;
    const body = g.createRadialGradient(c, c * 0.9, r * 0.1, c, c, r);
    body.addColorStop(0, "rgba(180,215,240,0.05)");
    body.addColorStop(1, "rgba(180,215,240,0.2)");
    g.fillStyle = body;
    g.beginPath();
    g.arc(c, c, r, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = "rgba(0,0,0,0.38)";
    g.beginPath();
    g.arc(c, c, r - 1, Math.PI * 1.1, Math.PI * 1.9);
    g.stroke();
    g.strokeStyle = "rgba(225,242,255,0.5)";
    g.beginPath();
    g.arc(c, c, r - 1, Math.PI * 0.15, Math.PI * 0.85);
    g.stroke();
    g.fillStyle = "rgba(255,255,255,0.7)";
    g.beginPath();
    g.ellipse(c - r * 0.32, c - r * 0.36, r * 0.2, r * 0.13, -0.6, 0, Math.PI * 2);
    g.fill();
  });

export const softSprite = (size: number, rgb: string, peak: number) =>
  sprite(size, (g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, `rgba(${rgb},${peak})`);
    grad.addColorStop(0.5, `rgba(${rgb},${peak * 0.35})`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  });
