import { createClient } from 'npm:@supabase/supabase-js@2'
import { createTripoImageTask, createTripoMultiviewTask, uploadTripoImage } from '../_shared/tripo.ts'
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/http.ts'

const imageLimit = 20 * 1024 * 1024
const allowedMime = new Set(['image/jpeg', 'image/png'])
const allowedViews = new Set(['front', 'left', 'back', 'right'])
type ObjectView = 'front' | 'left' | 'back' | 'right'

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
  const user = auth.user
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  let body: { sourceAssetId?: string; sourceImages?: Array<{ assetId?: string; view?: string }>; title?: string; idempotencyKey?: string; authorizeCost?: boolean }
  try { body = await request.json() } catch { return errorResponse('invalid_json') }
  if (body.authorizeCost !== true) return errorResponse('cost_confirmation_required', 400)
  if (!body.idempotencyKey || !/^[0-9a-f-]{36}$/i.test(body.idempotencyKey)) return errorResponse('invalid_idempotency_key')
  const title = (body.title ?? '').trim().slice(0, 160)
  if (!title) return errorResponse('title_required')

  const { data: existing } = await admin.from('reconstruction_jobs').select('id,status,external_job_id,model_id,progress,safe_error_code').eq('owner_id', user.id).eq('idempotency_key', body.idempotencyKey).maybeSingle()
  if (existing) return jsonResponse({ job: existing })

  const requestedSources = body.sourceImages?.length
    ? body.sourceImages
    : body.sourceAssetId ? [{ assetId: body.sourceAssetId, view: 'front' }] : []
  if (requestedSources.length < 1 || requestedSources.length > 4) return errorResponse('source_images_invalid')
  const normalizedSources: Array<{ assetId: string; view: ObjectView }> = []
  const seenAssets = new Set<string>()
  const seenViews = new Set<string>()
  for (const source of requestedSources) {
    if (!source.assetId || !/^[0-9a-f-]{36}$/i.test(source.assetId) || !source.view || !allowedViews.has(source.view) || seenAssets.has(source.assetId) || seenViews.has(source.view)) return errorResponse('source_images_invalid')
    seenAssets.add(source.assetId); seenViews.add(source.view)
    normalizedSources.push({ assetId: source.assetId, view: source.view as ObjectView })
  }
  if (normalizedSources.length > 1 && !seenViews.has('front')) return errorResponse('front_image_required')
  const sourceIds = normalizedSources.map(source => source.assetId)
  const { data: assets, error: assetError } = await admin.from('media_assets').select('id,storage_bucket,storage_path,asset_kind,mime_type,byte_size,original_name').eq('owner_id', user.id).in('id', sourceIds)
  if (assetError || !assets || assets.length !== sourceIds.length) return errorResponse('source_image_not_found', 404)
  const assetById = new Map(assets.map(asset => [asset.id, asset]))
  const sources: Array<{ view: ObjectView; asset: typeof assets[number]; blob: Blob }> = []
  for (const requested of normalizedSources) {
    const asset = assetById.get(requested.assetId)
    if (!asset || asset.asset_kind !== 'image' || asset.storage_bucket !== 'vitrine360-private') return errorResponse('source_image_not_found', 404)
    if (!asset.storage_path.startsWith(`${user.id}/tripo-inputs/`) || !allowedMime.has(asset.mime_type) || asset.byte_size > imageLimit) return errorResponse('source_image_invalid')
    const { data: blob, error: downloadError } = await admin.storage.from(asset.storage_bucket).download(asset.storage_path)
    if (downloadError || !blob || blob.size !== asset.byte_size || blob.size > imageLimit || !allowedMime.has(blob.type)) return errorResponse('source_image_unavailable', 422)
    sources.push({ view: requested.view, asset, blob })
  }
  const primaryAsset = sources.find(source => source.view === 'front')?.asset ?? sources[0].asset

  const modelId = crypto.randomUUID()
  const { error: modelError } = await admin.from('models_3d').insert({ id: modelId, owner_id: user.id, media_asset_id: primaryAsset.id, title, provider: 'tripo', model_status: 'processing' })
  if (modelError) return errorResponse('model_record_failed', 500)
  const { data: job, error: jobError } = await admin.from('reconstruction_jobs').insert({
    owner_id: user.id, job_kind: 'object_generation', provider: 'tripo', status: 'uploading', input_media_assets: sourceIds, model_id: modelId, idempotency_key: body.idempotencyKey,
  }).select('id,status,model_id').single()
  if (jobError || !job) {
    await admin.from('models_3d').delete().eq('id', modelId).eq('owner_id', user.id)
    return errorResponse('job_record_failed', 500)
  }
  const { error: usageError } = await admin.from('usage_events').insert({ owner_id: user.id, usage_kind: 'ai_job', quantity: 1, usage_status: 'reserved', reference_id: job.id })
  if (usageError) {
    await admin.from('reconstruction_jobs').update({ status: 'failed', safe_error_code: 'usage_reservation_failed', completed_at: new Date().toISOString() }).eq('id', job.id)
    return errorResponse('usage_reservation_failed', 500)
  }

  try {
    const uploadedInputs: Array<{ view: ObjectView; imageToken: string }> = []
    for (const source of sources) uploadedInputs.push({ view: source.view, imageToken: await uploadTripoImage(source.blob, source.asset.original_name || `${source.view}.png`, apiKey) })
    const externalJobId = uploadedInputs.length === 1
      ? await createTripoImageTask(uploadedInputs[0].imageToken, apiKey)
      : await createTripoMultiviewTask(uploadedInputs, apiKey)
    const now = new Date().toISOString()
    const { error: updateError } = await admin.from('reconstruction_jobs').update({ status: 'submitted', external_job_id: externalJobId, submitted_at: now, updated_at: now }).eq('id', job.id)
    await admin.from('models_3d').update({ provider_task_id: externalJobId, updated_at: now }).eq('id', modelId)
    await admin.from('media_assets').update({ asset_status: 'ready' }).in('id', sourceIds).eq('owner_id', user.id)
    if (updateError) return errorResponse('job_state_update_failed', 500)
    await admin.from('usage_events').update({ usage_status: 'committed', settled_at: now }).eq('reference_id', job.id)
    return jsonResponse({ job: { ...job, status: 'submitted', external_job_id: externalJobId } }, 202)
  } catch {
    // A request can time out after the provider accepted and billed it. Never retry that submission automatically.
    const now = new Date().toISOString()
    await admin.from('reconstruction_jobs').update({ status: 'timed_out', safe_error_code: 'provider_submission_unknown', completed_at: now, updated_at: now }).eq('id', job.id)
    await admin.from('models_3d').update({ model_status: 'failed', updated_at: now }).eq('id', modelId)
    await admin.from('usage_events').update({ usage_status: 'committed', settled_at: now }).eq('reference_id', job.id)
    return errorResponse('provider_submission_unknown', 502)
  }
})
