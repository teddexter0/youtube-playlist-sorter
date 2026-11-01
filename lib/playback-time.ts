// Count real playback time, not a jump caused by dragging the seek bar.
export function playedSecondsDelta(previous: number, current: number, elapsedSeconds: number, playing: boolean) {
  const delta = current - previous;
  if (!playing || delta < 0 || delta > elapsedSeconds * 2.5 + 1) return 0;
  return Math.min(delta, Math.max(0, elapsedSeconds), 15);
}
