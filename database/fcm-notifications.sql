create table if not exists aluno_push_tokens (
  id bigserial primary key,
  aluno_id bigint not null references students(id) on delete cascade,
  token text not null unique,
  plataforma text not null default 'web',
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists equipe_push_tokens (
  id bigserial primary key,
  membro_id bigint not null references team_members(id) on delete cascade,
  token text not null unique,
  plataforma text not null default 'web',
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists notificacoes (
  id bigserial primary key,
  aluno_id bigint not null references students(id) on delete cascade,
  turma_id bigint references rooms(id) on delete set null,
  titulo text not null,
  mensagem text not null default '',
  tipo text not null default 'conteudo',
  link_destino text not null default '/aluno',
  lida boolean not null default false,
  criado_em timestamptz not null default now(),
  lida_em timestamptz
);

create table if not exists birthday_push_deliveries (
  delivery_date date not null,
  token_id bigint not null references equipe_push_tokens(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (delivery_date, token_id)
);

create table if not exists birthday_push_attempts (
  id bigserial primary key,
  delivery_date date not null,
  token_id bigint not null references equipe_push_tokens(id) on delete cascade,
  status text not null check (status in ('sent', 'failed')),
  error_code text not null default '',
  message_id text not null default '',
  attempted_at timestamptz not null default now()
);
create index if not exists idx_aluno_push_tokens_aluno_ativo on aluno_push_tokens(aluno_id, ativo);
create index if not exists idx_equipe_push_tokens_membro_ativo on equipe_push_tokens(membro_id, ativo);
create index if not exists idx_notificacoes_aluno_criado on notificacoes(aluno_id, criado_em desc);
create index if not exists idx_notificacoes_aluno_nao_lida on notificacoes(aluno_id, lida) where lida = false;
create index if not exists idx_birthday_push_deliveries_sent_at on birthday_push_deliveries(sent_at desc);
create index if not exists idx_birthday_push_attempts_delivery on birthday_push_attempts(delivery_date desc, attempted_at desc);
