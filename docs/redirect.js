(() => {
  const target = new URL('https://vitrine360-web.vitrine360-654558de.workers.dev/')
  const projectPath = '/vitrine360'
  const path = location.pathname === projectPath
    ? '/'
    : location.pathname.startsWith(`${projectPath}/`)
      ? location.pathname.slice(projectPath.length)
      : '/'
  target.pathname = path === '/index.html' ? '/' : path
  target.search = location.search
  target.hash = location.hash
  const link = document.querySelector('[data-open-studio]')
  if (link) link.href = target.href
  location.replace(target.href)
})()
