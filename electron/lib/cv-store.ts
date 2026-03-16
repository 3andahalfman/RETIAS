import { supabase } from './supabase.js'

export interface CV {
  id: string
  user_id: string
  name: string
  content: string
  created_at: number
}

export async function saveCV(userId: string, name: string, content: string): Promise<CV> {
  const { data, error } = await supabase
    .from('cvs')
    .insert({ user_id: userId, name: name.trim(), content })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return {
    id: data.id,
    user_id: data.user_id,
    name: data.name,
    content: data.content,
    created_at: new Date(data.created_at).getTime(),
  }
}

export async function listCVs(userId: string): Promise<CV[]> {
  const { data, error } = await supabase
    .from('cvs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    content: row.content,
    created_at: new Date(row.created_at).getTime(),
  }))
}

export async function deleteCV(userId: string, cvId: string): Promise<void> {
  const { error } = await supabase
    .from('cvs')
    .delete()
    .eq('id', cvId)
    .eq('user_id', userId)

  if (error) throw new Error(error.message)
}
