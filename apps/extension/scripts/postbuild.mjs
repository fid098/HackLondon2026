import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const distDir = path.join(rootDir, 'dist')

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function copyIfExists(fromPath, toPath) {
  if (!fs.existsSync(fromPath)) return false
  ensureDir(path.dirname(toPath))
  fs.copyFileSync(fromPath, toPath)
  return true
}

function hasAllIconFiles(manifest, rootPath) {
  const iconPaths = new Set()

  const manifestIcons = manifest.icons ?? {}
  Object.values(manifestIcons).forEach((value) => {
    if (typeof value === 'string') iconPaths.add(value)
  })

  const actionIcons = manifest.action?.default_icon ?? {}
  Object.values(actionIcons).forEach((value) => {
    if (typeof value === 'string') iconPaths.add(value)
  })

  if (iconPaths.size === 0) return true

  return [...iconPaths].every((relativePath) =>
    fs.existsSync(path.join(rootPath, relativePath)),
  )
}

if (!fs.existsSync(distDir)) {
  throw new Error('dist directory not found. Run "vite build" before postbuild.')
}

// Ensure popup HTML lives at dist/popup/index.html to match manifest paths.
const popupFromVite = path.join(distDir, 'src', 'popup', 'index.html')
const popupToManifestPath = path.join(distDir, 'popup', 'index.html')
const copiedPopup = copyIfExists(popupFromVite, popupToManifestPath)

// Ensure content script stylesheet path in manifest exists.
copyIfExists(
  path.join(rootDir, 'src', 'content', 'overlay.css'),
  path.join(distDir, 'content', 'overlay.css'),
)

// Copy icons folder if present.
const iconsSrc = path.join(rootDir, 'icons')
const iconsDest = path.join(distDir, 'icons')
if (fs.existsSync(iconsSrc)) {
  fs.cpSync(iconsSrc, iconsDest, { recursive: true })
}

// Write normalized manifest into dist.
const manifestSrc = path.join(rootDir, 'manifest.json')
const manifestDest = path.join(distDir, 'manifest.json')
const manifest = JSON.parse(fs.readFileSync(manifestSrc, 'utf8'))

if (copiedPopup && manifest.action?.default_popup) {
  manifest.action.default_popup = 'popup/index.html'
}

if (!hasAllIconFiles(manifest, rootDir)) {
  if (manifest.action && manifest.action.default_icon) {
    delete manifest.action.default_icon
  }
  if (manifest.icons) {
    delete manifest.icons
  }
}

fs.writeFileSync(manifestDest, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

