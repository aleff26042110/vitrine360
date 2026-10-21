import { supabase } from './supabase'

export type AnalyticsDay = { date: string; views: number }
export type AnalyticsTour = { project_id: string; title: string; views: number }
export type AnalyticsSummary = {
  total_views: number
  period_views: number
  views_this_month: number
  published_tours: number
  scene_entries: number
  hotspot_clicks: number
  daily: AnalyticsDay[]
  top_tours: AnalyticsTour[]
}

export const emptyAnalytics: AnalyticsSummary = { total_views: 0, period_views: 0, views_this_month: 0, published_tours: 0, scene_entries: 0, hotspot_clicks: 0, daily: [], top_tours: [] }

export async function loadTourAnalytics(days = 30): Promise<AnalyticsSummary> {
  if (!supabase) return emptyAnalytics
  const { data, error } = await supabase.rpc('load_tour_analytics', { p_days: days })
  if (error) throw error
  const value = (data ?? {}) as Partial<AnalyticsSummary>
  const { data: interactions, error: interactionError } = await supabase.rpc('load_tour_interactions', { p_days: days })
  if (interactionError) throw interactionError
  return {
    total_views: Number(value.total_views ?? 0), period_views: Number(value.period_views ?? 0),
    views_this_month: Number(value.views_this_month ?? 0), published_tours: Number(value.published_tours ?? 0),
    scene_entries: Number(interactions?.scene_entries ?? 0), hotspot_clicks: Number(interactions?.hotspot_clicks ?? 0),
    daily: Array.isArray(value.daily) ? value.daily.map(day => ({ date: String(day.date), views: Number(day.views) })) : [],
    top_tours: Array.isArray(value.top_tours) ? value.top_tours.map(tour => ({ project_id: String(tour.project_id), title: String(tour.title), views: Number(tour.views) })) : [],
  }
}

export async function recordTourEvent(projectId: string, eventKind: 'view' | 'scene_change' | 'hotspot_click', sceneId?: string | null, hotspotId?: string | null, eventKey: string = crypto.randomUUID()) {
  if (!supabase) return false
  const { data, error } = await supabase.rpc('record_tour_event', {
    p_project_id: projectId, p_event_key: eventKey, p_event_kind: eventKind,
    p_scene_id: sceneId ?? null, p_hotspot_id: hotspotId ?? null,
  })
  if (error) throw error
  return data === true
}

export function tourViewEventKey(projectId: string) {
  const key = `v360:tour-view:${projectId}`
  try {
    const saved = sessionStorage.getItem(key)
    if (saved) return saved
    const created = crypto.randomUUID()
    sessionStorage.setItem(key, created)
    return created
  } catch {
    return crypto.randomUUID()
  }
}
