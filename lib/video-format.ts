// Public YouTube metadata does not expose a reliable isShort flag or source
// aspect ratio. Exclude the entire Shorts-duration range rather than guessing
// from thumbnails. This also excludes ordinary videos of three minutes or less.
export function isLongFormVideo(video: { title?: string; description?: string; durationSeconds: number }) {
  return Number.isFinite(video.durationSeconds) && video.durationSeconds > 180 &&
    !/(?:#shorts?\b|\byoutube shorts\b)/i.test(`${video.title ?? ""} ${video.description ?? ""}`);
}
