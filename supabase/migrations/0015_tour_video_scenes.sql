-- The projection remains independent from the media carrier: flat/equirectangular
-- scenes may contain images or video. Existing scenes retain their image default.
alter table public.scenes add column if not exists media_kind text not null default 'image';
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.scenes'::regclass and conname = 'scenes_media_kind_valid') then
    alter table public.scenes add constraint scenes_media_kind_valid check (media_kind in ('image', 'video'));
  end if;
end $$;

-- Preserve unrelated MIME types and any larger/custom-unlimited bucket limits.
-- No policy is widened: originals remain owner-private, published copies public.
update storage.buckets
set allowed_mime_types = case when allowed_mime_types is null then null else
  array(select distinct mime from unnest(allowed_mime_types || array['video/mp4','video/webm','video/quicktime']) mime order by mime) end,
  file_size_limit = case when file_size_limit is null then null else greatest(file_size_limit, 524288000) end
where id in ('vitrine360-private', 'vitrine360-public');
