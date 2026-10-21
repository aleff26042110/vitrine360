export function SceneMediaThumb({ src, video, alt = '' }: { src: string; video?: boolean; alt?: string }) {
  return video ? <video className="scene-media-thumb" src={src} muted playsInline preload="metadata" aria-label={alt || undefined} onLoadedMetadata={event => { if (Number.isFinite(event.currentTarget.duration)) event.currentTarget.currentTime = Math.min(.1, event.currentTarget.duration / 2) }} /> : <img className="scene-media-thumb" src={src} alt={alt} />
}
