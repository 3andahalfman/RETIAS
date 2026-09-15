import fs from 'node:fs/promises'
import path from 'node:path'

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.json', '.csv', '.yaml', '.yml',
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.java', '.html', '.css', '.xml', '.sql',
  '.rs', '.go', '.rb', '.php', '.sh', '.bat', '.ps1', '.toml', '.ini', '.env', '.vue', '.svelte',
])

const BINARY_EXTENSIONS = new Set(['.pdf', '.docx', '.doc'])

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'release', '__pycache__', 'vendor'])
const MAX_FILES = 80
const MAX_FILE_BYTES = 200_000

export interface FolderFile {
  name: string
  content: string
}

export interface PickFolderResult {
  folderPath: string
  files: FolderFile[]
}

export type ExtractBinaryFn = (buffer: Buffer, filename: string) => Promise<string>

async function readFileContent(
  fullPath: string,
  filename: string,
  extractBinary?: ExtractBinaryFn,
): Promise<string | null> {
  const ext = path.extname(filename).toLowerCase()
  try {
    const stat = await fs.stat(fullPath)
    if (stat.size > MAX_FILE_BYTES) return null

    if (TEXT_EXTENSIONS.has(ext)) {
      return await fs.readFile(fullPath, 'utf8')
    }

    if (BINARY_EXTENSIONS.has(ext) && extractBinary) {
      const buffer = await fs.readFile(fullPath)
      const text = await extractBinary(buffer, filename)
      if (!text || text.startsWith('ERROR:')) return null
      return text
    }
  } catch {
    return null
  }
  return null
}

export async function readProjectFolder(
  dirPath: string,
  extractBinary?: ExtractBinaryFn,
  base = dirPath,
): Promise<FolderFile[]> {
  const results: FolderFile[] = []

  async function walk(current: string) {
    if (results.length >= MAX_FILES) return
    let entries
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (results.length >= MAX_FILES) break
      if (entry.name.startsWith('.')) continue
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        await walk(full)
      } else if (entry.isFile()) {
        const content = await readFileContent(full, entry.name, extractBinary)
        if (!content?.trim()) continue
        const rel = path.relative(base, full).replace(/\\/g, '/')
        results.push({ name: rel, content })
      }
    }
  }

  await walk(dirPath)
  return results
}
