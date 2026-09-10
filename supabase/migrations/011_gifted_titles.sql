-- Cargos de presente (ex.: Parça do Baleia), concedidos pelo Chefe.

alter table player_stats
  add column if not exists gifted_titles text[] not null default '{}';
