alter table public.scenes add column if not exists north_offset double precision not null default 0 check (north_offset between -180 and 180);

alter table public.hotspots add column if not exists spot_kind text not null default 'info' check (spot_kind in ('link', 'info'));
alter table public.hotspots add column if not exists icon_style text not null default 'dot' check (icon_style in ('dot', 'arrow', 'info'));
alter table public.hotspots add column if not exists icon_scale double precision not null default 1 check (icon_scale between 0.6 and 1.8);
