import { createRoot } from 'react-dom/client'
import { ModelViewer } from '../src/PublicShowcase'

/** Exercises the actual public renderer without inventing a cloud publication or account. */
export function mountPublicModel(url: string) {
  const host = document.createElement('div')
  host.id = 'public-model-test'; host.style.width = '900px'; host.style.maxWidth = '100%'
  document.body.append(host)
  const root = createRoot(host)
  root.render(<ModelViewer url={url} background="#eef3f2" />)
  host.scrollIntoView()
  return () => { root.unmount(); host.remove(); URL.revokeObjectURL(url) }
}
