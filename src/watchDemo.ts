import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/** An authored sample model, independent of the photo and of any AI provider. */
export async function createWatchDemoFile(): Promise<File> {
  const watch = new THREE.Group()
  const textures: THREE.Texture[] = []
  const extras: THREE.Material[] = []
  let seed = 7319
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  const texture = (paint: (ctx: CanvasRenderingContext2D, size: number) => void, color = false) => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024
    paint(canvas.getContext('2d')!, 1024)
    const map = new THREE.CanvasTexture(canvas); if (color) map.colorSpace = THREE.SRGBColorSpace
    textures.push(map); return map
  }
  const grain = texture((ctx, size) => {
    ctx.fillStyle = '#777777'; ctx.fillRect(0, 0, size, size)
    for (let i = 0; i < 60000; i++) { const light = 75 + Math.floor(random() * 100); ctx.fillStyle = `rgb(${light},${light},${light})`; ctx.beginPath(); ctx.ellipse(random() * size, random() * size, 1 + random() * 3, .7 + random(), random() * Math.PI, 0, Math.PI * 2); ctx.fill() }
  })
  const normal = texture((ctx, size) => {
    ctx.fillStyle = '#8080ff'; ctx.fillRect(0, 0, size, size)
    for (let i = 0; i < 60000; i++) { ctx.fillStyle = `rgb(${116 + Math.floor(random() * 24)},${116 + Math.floor(random() * 24)},250)`; ctx.fillRect(random() * size, random() * size, 2, 2) }
  })
  const leatherColor = texture((ctx, size) => {
    ctx.fillStyle = '#633b29'; ctx.fillRect(0, 0, size, size)
    for (let i = 0; i < 100000; i++) {
      const variation = Math.floor(random() * 36) - 18
      ctx.fillStyle = `rgba(${101 + variation},${60 + variation},${39 + variation},.45)`
      ctx.beginPath(); ctx.ellipse(random() * size, random() * size, 1 + random() * 4, 1 + random() * 2, random() * Math.PI, 0, Math.PI * 2); ctx.fill()
    }
    ctx.strokeStyle = '#21150c28'; ctx.lineWidth = .8
    for (let i = 0; i < 5500; i++) { const x = random() * size; const y = random() * size; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 3, y - 3, x + 8, y + 2); ctx.stroke() }
  }, true)
  const brushed = texture((ctx, size) => {
    for (let i = 0; i < size; i++) { const shade = 115 + Math.floor(random() * 65); ctx.fillStyle = `rgb(${shade},${shade},${shade})`; ctx.fillRect(0, i, size, 1) }
  })
  const face = texture((ctx, size) => {
    ctx.fillStyle = '#152e45'; ctx.fillRect(0, 0, size, size)
    for (let i = 0; i < 1600; i++) { const angle = i * Math.PI * 2 / 1600; ctx.strokeStyle = i % 3 ? '#ffffff07' : '#010c1920'; ctx.beginPath(); ctx.moveTo(size / 2, size / 2); ctx.lineTo(size / 2 + Math.cos(angle) * size, size / 2 + Math.sin(angle) * size); ctx.stroke() }
    ctx.textAlign = 'center'; ctx.fillStyle = '#d5ddd9'; ctx.font = `500 ${size * .045}px Georgia`; ctx.fillText('VITRINE', size / 2, size * .32)
    ctx.font = `${size * .024}px sans-serif`; ctx.fillText('AUTOMÁTICO', size / 2, size * .68); ctx.fillText('100 m', size / 2, size * .72)
    ctx.fillStyle = '#d6ddd6'; ctx.fillRect(size * .70, size * .465, size * .12, size * .075)
    ctx.fillStyle = '#14232e'; ctx.font = `${size * .05}px sans-serif`; ctx.fillText('10', size * .76, size * .521)
  }, true)
  const metal = new THREE.MeshPhysicalMaterial({ color: '#c7ced4', metalness: 1, roughness: .35, roughnessMap: brushed, clearcoat: .2 })
  const polished = new THREE.MeshPhysicalMaterial({ color: '#e0e7ec', metalness: 1, roughness: .14 }); extras.push(polished)
  const dial = new THREE.MeshPhysicalMaterial({ map: face, roughness: .42, metalness: .25 })
  const leather = new THREE.MeshPhysicalMaterial({ map: leatherColor, roughness: .85, roughnessMap: grain, normalMap: normal, normalScale: new THREE.Vector2(.4, .4), sheen: .2, sheenColor: new THREE.Color('#aa7c57'), sheenRoughness: .9 })
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; watch.add(mesh)
    return mesh
  }
  const casing = add(new THREE.CylinderGeometry(1, 1, .28, 96), metal)
  casing.rotation.x = Math.PI / 2
  add(new THREE.CircleGeometry(.91, 96), dial, 0, 0, .145)
  const rim = add(new THREE.TorusGeometry(.96, .035, 16, 96), polished, 0, 0, .145)
  rim.name = 'Aro'
  for (let i = 0; i < 60; i++) {
    const angle = i * Math.PI / 30
    const hour = i % 5 === 0
    const marker = add(new RoundedBoxGeometry(hour ? .045 : .014, hour ? .15 : .048, .018, 2, .003), polished, Math.sin(angle) * (hour ? .77 : .85), Math.cos(angle) * (hour ? .77 : .85), .16)
    marker.rotation.z = -angle
  }
  for (const [length, width, angle] of [[.48, .055, Math.PI / 3], [.68, .04, -Math.PI / 3], [.76, .012, Math.PI * .92]]) {
    const hand = new THREE.Group()
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(width, length, .018, 3, .004), polished)
    mesh.position.y = length / 2; hand.add(mesh)
    hand.position.z = .185; hand.rotation.z = angle; watch.add(hand)
  }
  add(new THREE.SphereGeometry(.055, 24, 12), polished, 0, 0, .20)
  const crown = add(new THREE.CylinderGeometry(.1, .1, .18, 48), polished, 1.06, 0, 0)
  crown.rotation.z = Math.PI / 2
  for (let i = 0; i < 32; i++) { const angle = i * Math.PI / 16; add(new THREE.BoxGeometry(.15, .009, .009), metal, 1.06, Math.cos(angle) * .10, Math.sin(angle) * .10) }
  for (const x of [-.40, .40]) for (const y of [-.96, .96]) {
    const lug = add(new RoundedBoxGeometry(.15, .40, .22, 4, .035), metal, x, y, -.04); lug.rotation.x = y > 0 ? -.25 : .25
  }
  const glass = new THREE.MeshPhysicalMaterial({ color: '#ffffff', transmission: .9, thickness: .03, roughness: .03, ior: 1.46, transparent: true, opacity: .20, depthWrite: false, clearcoat: 1 }); extras.push(glass)
  const crystal = add(new THREE.SphereGeometry(3.5, 96, 24, 0, Math.PI * 2, 0, Math.asin(.91 / 3.5)), glass, 0, 0, -3.24)
  crystal.rotation.x = Math.PI / 2
  const strap = new THREE.Shape()
  strap.absarc(0, 0, 1.4, 0, Math.PI * 2, false)
  const hole = new THREE.Path()
  hole.absarc(0, 0, 1.23, 0, Math.PI * 2, true)
  strap.holes.push(hole)
  const band = add(new THREE.ExtrudeGeometry(strap, { depth: .68, bevelEnabled: true, bevelSize: .016, bevelThickness: .016, bevelSegments: 3, curveSegments: 96 }), leather, -.34, 0, -1.55)
  band.rotation.y = Math.PI / 2
  const thread = new THREE.MeshStandardMaterial({ color: '#d2b58b', roughness: .9 }); extras.push(thread)
  for (const x of [-.27, .27]) for (let i = 0; i < 100; i++) {
    const angle = i * Math.PI * 2 / 100
    const stitch = add(new THREE.CapsuleGeometry(.009, .035, 3, 5), thread, x, Math.sin(angle) * 1.41, -1.55 + Math.cos(angle) * 1.41)
    stitch.rotation.x = -angle
  }
  const buckle = add(new RoundedBoxGeometry(.79, .24, .1, 4, .03), polished, 0, -.20, -2.94); buckle.name = 'Fivela'
  watch.rotation.x = -.18; watch.rotation.y = -.35
  watch.name = 'Relógio de demonstração — modelo criado no aplicativo'
  const optimized = new THREE.Group(); optimized.name = watch.name
  try {
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>()
  watch.updateMatrixWorld(true)
  watch.traverse(object => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return
    const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone()
    geometry.applyMatrix4(object.matrixWorld)
    const batch = batches.get(object.material) ?? []; batch.push(geometry); batches.set(object.material, batch)
  })
  for (const [mat, batch] of batches) {
    const merged = mergeGeometries(batch)
    batch.forEach(geometry => geometry.dispose())
    if (!merged) throw new Error('Não foi possível preparar os detalhes do relógio.')
    optimized.add(new THREE.Mesh(merged, mat))
  }
    const binary = await new GLTFExporter().parseAsync(optimized, { binary: true })
    if (!(binary instanceof ArrayBuffer)) throw new Error('Não foi possível preparar o modelo de demonstração.')
    return new File([binary], 'relogio-demonstracao.glb', { type: 'model/gltf-binary' })
  } finally {
    watch.traverse(object => {
      if (object instanceof THREE.Mesh) object.geometry.dispose()
    })
    optimized.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose() })
    metal.dispose(); dial.dispose(); leather.dispose(); extras.forEach(value => value.dispose()); textures.forEach(value => value.dispose())
  }
}
