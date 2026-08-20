-- Contador eterno de apostas na Haxbooket (!bet).

alter table room_meta
  add column if not exists bets int not null default 0;
