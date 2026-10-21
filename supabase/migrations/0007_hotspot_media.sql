alter table public.hotspots add column if not exists image_url text;
alter table public.hotspots add column if not exists embed_url text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conrelid = 'public.hotspots'::regclass and conname = 'hotspots_image_url_valid'
  ) then
    alter table public.hotspots add constraint hotspots_image_url_valid check (
      image_url is null or (char_length(image_url) <= 2048 and image_url ~ '^https?://[^[:space:]]+$')
    );
  end if;

  if not exists (
    select 1 from pg_constraint where conrelid = 'public.hotspots'::regclass and conname = 'hotspots_embed_url_valid'
  ) then
    alter table public.hotspots add constraint hotspots_embed_url_valid check (
      embed_url is null or (
        char_length(embed_url) <= 2048
        and embed_url ~ '^https://((www\.)?youtube\.com|(www\.)?youtube-nocookie\.com|youtu\.be|(www\.)?vimeo\.com|player\.vimeo\.com)/[^[:space:]]+$'
      )
    );
  end if;
end
$$;
