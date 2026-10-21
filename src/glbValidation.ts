export type GlbLimits = {
  maxJsonBytes: number
  maxNodes: number
  maxMeshes: number
  maxPrimitives: number
  maxTriangles: number
  maxTextures: number
  maxTextureBytes: number
}

export const defaultGlbLimits: GlbLimits = {
  maxJsonBytes: 8 * 1024 * 1024,
  maxNodes: 5_000,
  maxMeshes: 500,
  maxPrimitives: 2_000,
  maxTriangles: 2_000_000,
  maxTextures: 128,
  maxTextureBytes: 32 * 1024 * 1024,
}

export type GlbInspection = { nodes: number; meshes: number; primitives: number; triangles: number; textures: number; textureBytes: number }
const glbMagic = 0x46546c67
const jsonChunk = 0x4e4f534a

type GltfJson = {
  asset?: { version?: string }
  buffers?: Array<{ uri?: string }>
  bufferViews?: Array<{ byteLength?: number }>
  accessors?: Array<{ count?: number }>
  images?: Array<{ uri?: string; bufferView?: number }>
  textures?: unknown[]
  nodes?: unknown[]
  meshes?: Array<{ primitives?: Array<{ indices?: number; attributes?: { POSITION?: number }; mode?: number }> }>
}

export async function inspectGlb(file: Blob, limits: GlbLimits = defaultGlbLimits): Promise<GlbInspection> {
  if (file.size < 20) throw new Error('O arquivo está incompleto: cabeçalho GLB ausente.')
  const header = new DataView(await file.slice(0, 20).arrayBuffer())
  if (header.getUint32(0, true) !== glbMagic) throw new Error('O arquivo não contém a assinatura GLB válida.')
  if (header.getUint32(4, true) !== 2) throw new Error('Este visualizador aceita modelos GLB na versão 2.0.')
  if (header.getUint32(8, true) !== file.size) throw new Error('O tamanho declarado no cabeçalho GLB não corresponde ao arquivo.')
  const jsonBytes = header.getUint32(12, true)
  if (header.getUint32(16, true) !== jsonChunk || jsonBytes < 2 || jsonBytes % 4 !== 0 || jsonBytes > limits.maxJsonBytes || 20 + jsonBytes > file.size) {
    throw new Error('O bloco JSON do GLB é inválido ou excede o limite de leitura.')
  }

  let document: GltfJson
  try { document = JSON.parse(new TextDecoder().decode(await file.slice(20, 20 + jsonBytes).arrayBuffer()).replace(/\0+$/g, '').trim()) as GltfJson }
  catch { throw new Error('O documento JSON deste GLB está inválido.') }
  if (!document.asset?.version?.startsWith('2.')) throw new Error('O GLB não declara um documento glTF 2.x.')
  if ((document.buffers ?? []).some(buffer => buffer.uri)) throw new Error('O GLB referencia arquivos externos. Exporte o modelo como arquivo GLB autocontido.')
  if ((document.images ?? []).some(image => image.uri && !image.uri.startsWith('data:'))) throw new Error('O modelo referencia uma textura externa. Incorpore as texturas ao GLB.')

  const nodes = document.nodes?.length ?? 0
  const meshes = document.meshes?.length ?? 0
  const textures = document.textures?.length ?? 0
  const primitivesList = (document.meshes ?? []).flatMap(mesh => mesh.primitives ?? [])
  if (!meshes || !primitivesList.length) throw new Error('O GLB não contém uma malha 3D para visualizar.')
  if (nodes > limits.maxNodes) throw new Error(`O modelo possui ${nodes} nós; o limite para esta versão é ${limits.maxNodes}.`)
  if (meshes > limits.maxMeshes) throw new Error(`O modelo possui ${meshes} malhas; o limite para esta versão é ${limits.maxMeshes}.`)
  if (primitivesList.length > limits.maxPrimitives) throw new Error(`O modelo possui ${primitivesList.length} partes de malha; o limite é ${limits.maxPrimitives}.`)
  if (textures > limits.maxTextures) throw new Error(`O modelo possui ${textures} texturas; o limite é ${limits.maxTextures}.`)

  let triangles = 0
  for (const primitive of primitivesList) {
    const accessorIndex = primitive.indices ?? primitive.attributes?.POSITION
    const count = accessorIndex === undefined ? 0 : document.accessors?.[accessorIndex]?.count ?? 0
    const mode = primitive.mode ?? 4
    if (mode === 4) triangles += Math.floor(count / 3)
    else if (mode === 5 || mode === 6) triangles += Math.max(0, count - 2)
  }
  if (triangles > limits.maxTriangles) throw new Error(`O modelo possui cerca de ${triangles.toLocaleString('pt-BR')} triângulos; o limite do navegador é ${limits.maxTriangles.toLocaleString('pt-BR')}. Otimize a malha e exporte novamente.`)

  const views = document.bufferViews ?? []
  let textureBytes = 0
  for (const image of document.images ?? []) {
    if (image.bufferView !== undefined) textureBytes += views[image.bufferView]?.byteLength ?? 0
    else if (image.uri?.startsWith('data:')) textureBytes += Math.floor((image.uri.split(',')[1]?.length ?? 0) * .75)
  }
  if (textureBytes > limits.maxTextureBytes) throw new Error(`As texturas incorporadas ocupam ${Math.ceil(textureBytes / 1024 / 1024)} MB; reduza-as para menos de ${Math.floor(limits.maxTextureBytes / 1024 / 1024)} MB.`)
  return { nodes, meshes, primitives: primitivesList.length, triangles, textures, textureBytes }
}
