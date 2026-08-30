-- EBR Neon test schema.
-- Execute este arquivo no SQL Editor do Neon antes de ligar a copia de teste ao banco.

create table if not exists rooms (
  id bigserial primary key,
  name text not null unique,
  teacher text default '',
  age_range text default '',
  students integer default 0,
  avg numeric(5,2) default 0,
  accent text default '#3B82F6',
  planning text default '',
  planning_date date,
  planning_updated_by text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists students (
  id bigserial primary key,
  ra text not null unique,
  name text not null,
  phone text default '',
  room text not null references rooms(name) on update cascade,
  frequency numeric(5,2) default 0,
  status text default 'Ativo',
  birthday text default '',
  age integer default 0,
  avatar text default '',
  photo text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists pending_enrollments (
  id bigserial primary key,
  name text not null,
  phone text default '',
  room text default '',
  birthday text default '',
  avatar text default '',
  photo text default '',
  created_at timestamptz default now()
);

create table if not exists team_members (
  id bigserial primary key,
  name text not null,
  username text not null unique,
  email text default '',
  phone text default '',
  password text not null,
  role text not null check (role in ('admin', 'teacher')),
  room text default '',
  avatar text default '',
  photo text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists financial_categories (
  id bigserial primary key,
  type text not null check (type in ('entrada', 'saida')),
  name text not null,
  created_at timestamptz default now(),
  unique (type, name)
);

create table if not exists financial_entries (
  id bigserial primary key,
  type text not null check (type in ('entrada', 'saida')),
  title text not null,
  category text not null,
  value numeric(12,2) not null default 0,
  date date not null,
  month integer not null,
  year integer not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists attendance_records (
  id bigserial primary key,
  attendance_date date not null,
  room text not null references rooms(name) on update cascade,
  student_id bigint not null references students(id) on delete cascade,
  present boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (attendance_date, student_id)
);

create table if not exists exams (
  id bigserial primary key,
  title text not null,
  room text not null,
  month integer not null,
  max_score numeric(8,2) not null default 100,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists exam_scores (
  exam_id bigint not null references exams(id) on delete cascade,
  student_id bigint not null references students(id) on delete cascade,
  score numeric(8,2) not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (exam_id, student_id)
);

create table if not exists student_portal_contents (
  id bigserial primary key,
  type text not null,
  title text not null,
  body text default '',
  media_url text default '',
  room text default 'Geral',
  author_name text default '',
  active boolean default true,
  published_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists student_library_items (
  id bigserial primary key,
  title text not null,
  description text default '',
  price numeric(12,2) default 0,
  image_url text default '',
  payment_url text default '',
  stock_quantity integer default 0,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists student_ministry_items (
  id bigserial primary key,
  title text not null,
  description text default '',
  price numeric(12,2) default 0,
  payment_key text default '',
  image_url text default '',
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists student_questions (
  id bigserial primary key,
  student_id bigint references students(id) on delete cascade,
  student_name text not null,
  room text not null,
  message text not null,
  status text default 'Pendente',
  response text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists student_prayer_requests (
  id bigserial primary key,
  student_id bigint references students(id) on delete cascade,
  student_name text not null,
  room text not null,
  message text not null,
  status text default 'Pendente',
  response text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists teacher_schedules (
  id bigserial primary key,
  schedule_date date not null,
  teacher_id bigint references team_members(id) on delete set null,
  teacher_name text not null,
  position text default '',
  location text default '',
  notes text default '',
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

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
create index if not exists idx_birthday_push_attempts_delivery on birthday_push_attempts(delivery_date desc, attempted_at desc);

create index if not exists idx_students_room on students(room);
create index if not exists idx_attendance_room_date on attendance_records(room, attendance_date);
create index if not exists idx_financial_entries_date on financial_entries(date);
create index if not exists idx_portal_contents_room_active on student_portal_contents(room, active);
create index if not exists idx_student_questions_student on student_questions(student_id, created_at desc);
create index if not exists idx_student_prayers_student on student_prayer_requests(student_id, created_at desc);


alter table student_ministry_items add column if not exists image_url text default '';
