-- Contador eterno de “viraram viado” (!viado).

alter table room_meta
  add column if not exists viados int not null default 0;
