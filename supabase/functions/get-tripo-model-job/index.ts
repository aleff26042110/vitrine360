import { createClient } from 'npm:@supabase/supabase-js@2'
import { inspectGlb } from '../../../src/glbValidation.ts'
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/http.ts'
import { getTripoTask } from '../_shared/tripo.ts'

const maxModelBytes = 100 * 1024 * 1024

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return errorResponse('method_not_allowed', 405)
  const apiKey = Deno.env.get('TRIPO_API_KEY')
  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!apiKey || !url || !anonKey || !serviceKey) return errorResponse('provider_not_configured', 503)
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return errorResponse('unauthorized', 401)
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } })
  const { data: auth, error: authError } = await userClient.auth.getUser()
  if (authError || !auth.user) return errorResponse('unauthorized', 401)
  let body: { jobId?: string }
  try { body = await request.json() } catch { return errorResponse('invalid_json') }
  if (!body.jobId || !/^[0-9a-f-]{36}$/i.test(body.jobId)) return errorResponse('invalid_job_id')
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: job, error: jobError } = await admin.from('reconstruction_jobs').select('id,owner_id,status,provider,external_job_id,model_id,progress,result_media_asset_id,safe_error_code').eq('id', body.jobId).eq('owner_id', auth.user.id).maybeSingle()
  if (jobError || !job) return errorResponse('job_not_found', 404)
  if (job.provider !== 'tripo' || !job.external_job_id) return jsonResponse({ job })
  if (job.status === 'succeeded') {
    const { data: asset } = job.result_media_asset_id
      ? await admin.from('media_assets').select('storage_bucket,storage_path,byte_size').eq('id', job.result_media_asset_id).eq('owner_id', auth.user.id).maybeSingle()
      : { data: null }
    const { data: model } = await admin.from('models_3d').select('id,title').eq('id', job.model_id).eq('owner_id', auth.user.id).maybeSingle()
    return jsonResponse({ job, model: asset && model ? { ...asset, id: model.id, title: model.title } : null })
  }
  if (['failed', 'cancelled', 'rejected', 'timed_out'].includes(job.status)) return jsonResponse({ job })

  let task
  try { task = await getTripoTask(job.external_job_id, apiKey) }
  catch { return errorResponse('provider_status_unavailable', 502) }
  const now = new Date().toISOString()
  if (task.state === 'failed' || task.state === 'cancelled') {
    const status = task.state === 'failed' ? 'failed' : 'cancelled'
    await admin.from('reconstruction_jobs').update({ status, progress: task.progress, safe_error_code: task.errorCode ?? `provider_${status}`, completed_at: now, updated_at: now }).eq('id', job.id).eq('owner_id', auth.user.id)
    await admin.from('models_3d').update({ model_status: 'failed', updated_at: now }).eq('id', job.model_id).eq('owner_id', auth.user.id)
    // Keep submitted jobs committed: provider failures may still consume credits.
    return jsonResponse({ job: { ...job, status, progress: task.progress, safe_error_code: task.errorCode ?? `provider_${status}` } })
  }
  if (task.state !== 'succeeded') {
    const status = task.state === 'running' ? 'running' : 'submitted'
    await admin.from('reconstruction_jobs').update({ status, progress: task.progress, started_at: status === 'running' ? now : undefined, updated_at: now }).eq('id', job.id).eq('owner_id', auth.user.id)
    return jsonResponse({ job: { ...job, status, progress: task.progress } })
  }
  if (!task.modelUrl) return errorResponse('provider_model_url_invalid', 502)

  try {
    const response = await fetch(task.modelUrl, { signal: AbortSignal.timeout(25_000), redirect: 'error' })
    if (!response.ok) throw new Error('model_download_failed')
    const declaredSize = Number(response.headers.get('content-length'))
    if (Number.isFinite(declaredSize) && declaredSize > maxModelBytes) throw new Error('model_too_large')
    const modelBytes = await response.arrayBuffer()
    if (modelBytes.byteLength > maxModelBytes) throw new Error('model_too_large')
    const modelBlob = new Blob([modelBytes], { type: 'model/gltf-binary' })
    await inspectGlb(modelBlob)
    const { data: model, error: modelLookupError } = await admin.from('models_3d').select('id,title').eq('id', job.model_id).eq('owner_id', auth.user.id).single()
    if (modelLookupError || !model) throw new Error('model_record_missing')
    const assetId = job.result_media_asset_id ?? crypto.randomUUID()
    const path = `${auth.user.id}/models/${model.id}/generated.glb`
    const { error: storageError } = await admin.storage.from('vitrine360-private').upload(path, modelBlob, { upsert: true, contentType: 'model/gltf-binary', cacheControl: '0' })
    if (storageError) throw new Error('model_storage_failed')
    const { error: assetError } = await admin.from('media_assets').upsert({
      id: assetId, owner_id: auth.user.id, storage_bucket: 'vitrine360-private', storage_path: path, asset_kind: 'model_glb', original_name: `${model.title}.glb`.slice(0, 255), mime_type: 'model/gltf-binary', byte_size: modelBytes.byteLength,
    }, { onConflict: 'storage_bucket,storage_path' })
    if (assetError) throw new Error('model_asset_record_failed')
    const { error: modelUpdateError } = await admin.from('models_3d').update({ media_asset_id: assetId, model_status: 'ready', updated_at: now }).eq('id', model.id).eq('owner_id', auth.user.id)
    const { error: jobUpdateError } = await admin.from('reconstruction_jobs').update({ status: 'succeeded', progress: 100, result_media_asset_id: assetId, completed_at: now, updated_at: now }).eq('id', job.id).eq('owner_id', auth.user.id)
    if (modelUpdateError || jobUpdateError) throw new Error('model_finalize_failed')
    return jsonResponse({ job: { ...job, status: 'succeeded', progress: 100, result_media_asset_id: assetId }, model: { id: model.id, title: model.title, storage_bucket: 'vitrine360-private', storage_path: path, byte_size: modelBytes.byteLength } })
  } catch (error) {
    const code = error instanceof Error && ['model_too_large', 'model_storage_failed', 'model_asset_record_failed', 'model_record_missing', 'model_finalize_failed'].includes(error.message) ? error.message : 'provider_result_invalid'
    await admin.from('reconstruction_jobs').update({ status: 'failed', safe_error_code: code, completed_at: now, updated_at: now }).eq('id', job.id).eq('owner_id', auth.user.id)
    await admin.from('models_3d').update({ model_status: 'failed', updated_at: now }).eq('id', job.model_id).eq('owner_id', auth.user.id)
    return errorResponse(code, 422)
  }
})
