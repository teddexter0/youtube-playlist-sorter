export type Box = { left: number; top: number; right: number; bottom: number };
type Point = { x: number; y: number };
function edge(box: Box, toward: Point): Point {
  const x = (box.left + box.right) / 2, y = (box.top + box.bottom) / 2;
  const dx = toward.x - x, dy = toward.y - y;
  const scale = Math.min(dx ? (box.right - box.left) / 2 / Math.abs(dx) : Infinity, dy ? (box.bottom - box.top) / 2 / Math.abs(dy) : Infinity);
  return Number.isFinite(scale) ? { x: x + dx * scale, y: y + dy * scale } : { x, y };
}
export function guideArrow(target: Box, card: Box, width: number, height: number) {
  const visible = { left: Math.max(0, target.left), right: Math.min(width, target.right), top: Math.max(0, target.top), bottom: Math.min(height, target.bottom) };
  if (visible.right <= visible.left || visible.bottom <= visible.top) return null;
  if (visible.left < card.right && visible.right > card.left && visible.top < card.bottom && visible.bottom > card.top) return null;
  const center = { x: (visible.left + visible.right) / 2, y: (visible.top + visible.bottom) / 2 };
  const start = edge(card, center);
  const end = edge(visible, { x: (card.left + card.right) / 2, y: (card.top + card.bottom) / 2 });
  return { start, end, path: `M ${start.x} ${start.y} L ${end.x} ${end.y}` };
}
