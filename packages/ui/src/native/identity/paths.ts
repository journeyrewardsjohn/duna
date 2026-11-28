/**
 * Scales an SVG path written in card fractions (0–1 across, 0–1 down) to
 * points. Every command the art uses (M, L, C, Q, T, Z) takes absolute x y
 * pairs, so numbers alternate x, y. Pure.
 */
export function scalePath(d: string, width: number, height: number): string {
  let axis = 0;
  return d.replace(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g, (token) => {
    if (/^[A-Za-z]$/.test(token)) {
      axis = 0;
      return token;
    }
    const value = Number(token) * (axis % 2 === 0 ? width : height);
    axis += 1;
    return String(Math.round(value * 10) / 10);
  });
}
