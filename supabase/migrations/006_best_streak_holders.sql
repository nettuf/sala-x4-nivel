-- Nomes de quem fez o recorde de streak da sala.

alter table room_meta
  add column if not exists best_streak_holders text[] not null default '{}';
