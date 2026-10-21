import { describe, expect, it } from 'vitest'
import { inspectGlb } from '../src/glbValidation'

function makeGlb(document: object, extraJsonPadding = 0) {
  let json = JSON.stringify(document)
  json += ' '.repeat((4 - (json.length + extraJsonPadding) % 4) % 4 + extraJsonPadding)
  const jsonBytes = new TextEncoder().encode(json)
  const header = new ArrayBuffer(20)
  const view = new DataView(header)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, 20 + jsonBytes.length, true)
  view.setUint32(12, jsonBytes.length, true)
  view.setUint32(16, 0x4e4f534a, true)
  return new Blob([header, jsonBytes])
}

const validModel = {
  asset: { version: '2.0' },
  nodes: [{ mesh: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
  accessors: [{ count: 3 }],
  buffers: [{ byteLength: 36 }],
}

describe('inspectGlb', () => {
  it('accepts a small self-contained GLB and reports its mesh complexity', async () => {
    const result = await inspectGlb(makeGlb(validModel))
    expect(result).toMatchObject({ nodes: 1, meshes: 1, primitives: 1, triangles: 1, textures: 0 })
  })

  it('rejects a file without the GLB signature', async () => {
    await expect(inspectGlb(new Blob([new Uint8Array(24)]))).rejects.toThrow('assinatura GLB')
  })

  it('rejects inconsistent header lengths before parsing the document', async () => {
    const file = makeGlb(validModel)
    const bytes = await file.arrayBuffer()
    new DataView(bytes).setUint32(8, file.size + 4, true)
    await expect(inspectGlb(new Blob([bytes]))).rejects.toThrow('não corresponde ao arquivo')
  })

  it('rejects geometry over the configured triangle budget', async () => {
    const large = { ...validModel, accessors: [{ count: 6_000_006 }] }
    await expect(inspectGlb(makeGlb(large))).rejects.toThrow('triângulos')
  })

  it('rejects external model and texture references', async () => {
    await expect(inspectGlb(makeGlb({ ...validModel, buffers: [{ byteLength: 36, uri: 'mesh.bin' }] }))).rejects.toThrow('arquivos externos')
    await expect(inspectGlb(makeGlb({ ...validModel, images: [{ uri: 'https://example.com/texture.png' }] }))).rejects.toThrow('textura externa')
  })
})
