import { supabase } from '../lib/supabase'

export async function createNotification(
  userId: string,
  type: string,
  title: string,
  body: string,
  relatedId?: string
) {
  await supabase.from('notifications').insert({
    user_id: userId,
    type,
    title,
    body,
    related_id: relatedId ?? null,
  })
}
