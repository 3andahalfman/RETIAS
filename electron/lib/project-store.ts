import { supabase } from './supabase.js'
import { buildProjectContextString } from './project-context.js'

export interface Project {
  id: string
  user_id: string
  name: string
  instructions: string
  folder_path: string | null
  created_at: number
  updated_at: number
}

export interface ProjectFile {
  id: string
  project_id: string
  user_id: string
  name: string
  content: string
  created_at: number
}

export interface ProjectSummary extends Project {
  file_count: number
}

export interface ProjectWithFiles extends Project {
  files: ProjectFile[]
}

function mapProject(row: Record<string, unknown>): Project {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    name: String(row.name),
    instructions: String(row.instructions ?? ''),
    folder_path: row.folder_path ? String(row.folder_path) : null,
    created_at: new Date(String(row.created_at)).getTime(),
    updated_at: new Date(String(row.updated_at)).getTime(),
  }
}

function mapFile(row: Record<string, unknown>): ProjectFile {
  return {
    id: String(row.id),
    project_id: String(row.project_id),
    user_id: String(row.user_id),
    name: String(row.name),
    content: String(row.content ?? ''),
    created_at: new Date(String(row.created_at)).getTime(),
  }
}

export async function listProjects(userId: string): Promise<ProjectSummary[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*, project_files(id)')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

  if (error) throw new Error(error.message)

  return (data ?? []).map((row) => {
    const project = mapProject(row)
    const files = row.project_files as { id: string }[] | null
    return { ...project, file_count: files?.length ?? 0 }
  })
}

export async function getProject(userId: string, projectId: string): Promise<ProjectWithFiles | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null

  const { data: files, error: filesError } = await supabase
    .from('project_files')
    .select('*')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (filesError) throw new Error(filesError.message)

  return {
    ...mapProject(data),
    files: (files ?? []).map(mapFile),
  }
}

export async function saveProject(
  userId: string,
  payload: { id?: string; name: string; instructions: string; folderPath?: string | null },
): Promise<Project> {
  const name = payload.name.trim()
  if (!name) throw new Error('Project name is required')

  const instructions = payload.instructions ?? ''
  const folderPath = payload.folderPath?.trim() || null
  const now = new Date().toISOString()
  const row = { name, instructions, folder_path: folderPath, updated_at: now }

  if (payload.id) {
    const { data, error } = await supabase
      .from('projects')
      .update(row)
      .eq('id', payload.id)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) throw new Error(error.message)
    return mapProject(data)
  }

  const { data, error } = await supabase
    .from('projects')
    .insert({ user_id: userId, ...row })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return mapProject(data)
}

export async function deleteProject(userId: string, projectId: string): Promise<void> {
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId)
    .eq('user_id', userId)

  if (error) throw new Error(error.message)
}

export async function addProjectFile(
  userId: string,
  projectId: string,
  name: string,
  content: string,
): Promise<ProjectFile> {
  const safeName = name.trim() || 'untitled'
  const { data, error } = await supabase
    .from('project_files')
    .insert({ project_id: projectId, user_id: userId, name: safeName, content })
    .select()
    .single()

  if (error) throw new Error(error.message)

  await supabase
    .from('projects')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', projectId)
    .eq('user_id', userId)

  return mapFile(data)
}

export async function deleteProjectFile(userId: string, fileId: string): Promise<void> {
  const { error } = await supabase
    .from('project_files')
    .delete()
    .eq('id', fileId)
    .eq('user_id', userId)

  if (error) throw new Error(error.message)
}

async function loadFolderFiles(folderPath: string) {
  try {
    const { readProjectFolder } = await import('./project-folder-import.js')
    const { extractDocumentBuffer } = await import('./extract-document.js')
    return readProjectFolder(folderPath, extractDocumentBuffer)
  } catch (err) {
    console.warn('[project-store] Could not read linked folder:', err)
    return []
  }
}

/** Load project instructions + folder/files and build the context string for a session. */
export async function buildProjectContextForSession(userId: string, projectId: string): Promise<string> {
  const project = await getProject(userId, projectId)
  if (!project) return ''

  let files = project.files.map((f) => ({ name: f.name, content: f.content }))

  // Prefer live folder contents (Claude Code-style) when a local folder is linked
  if (project.folder_path) {
    const live = await loadFolderFiles(project.folder_path)
    if (live.length > 0) files = live
  }

  return buildProjectContextString(project.instructions, files)
}
