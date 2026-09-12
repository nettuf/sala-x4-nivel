-- Totais históricos da sala. O prune de matches (90d) não pode zerar o placar.

alter table public.room_meta
  add column if not exists games int not null default 0,
  add column if not exists goals int not null default 0;

comment on column public.room_meta.games is
  'Total histórico de partidas válidas. Sobrevive ao prune de matches.';
comment on column public.room_meta.goals is
  'Total histórico de gols. Sobrevive ao prune de matches.';
