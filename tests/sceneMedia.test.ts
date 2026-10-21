import { describe, expect, it } from 'vitest'
import { detectSceneProjection, isVideoScene, validateSceneFile } from '../src/sceneMedia'

describe('scene media input boundary', () => {
  it('suggests projection without claiming a flat capture is panoramic', () => {
    expect(detectSceneProjection(1920, 960)).toBe('panorama')
    expect(detectSceneProjection(1920, 1080)).toBe('foto')
    expect(detectSceneProjection(1080, 1920)).toBe('foto')
  })
  it('accepts supported video or images and preserves legacy video MIME detection', () => {
    const file = new File(['webm'], 'video.webm', { type: 'video/webm' })
    expect(validateSceneFile(file)).toBe('video')
    expect(isVideoScene({ file })).toBe(true)
    expect(validateSceneFile(new File(['jpeg'], 'image.jpg', { type: 'image/jpeg' }))).toBe('image')
    expect(() => validateSceneFile(new File(['exe'], 'app.exe'))).toThrow(/imagens ou vídeos/)
    expect(() => validateSceneFile(new File([], 'empty.webm', { type: 'video/webm' }))).toThrow(/conter dados/)
  })
})
