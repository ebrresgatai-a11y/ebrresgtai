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

create index if not exists idx_students_room on students(room);
create index if not exists idx_attendance_room_date on attendance_records(room, attendance_date);
create index if not exists idx_financial_entries_date on financial_entries(date);
create index if not exists idx_portal_contents_room_active on student_portal_contents(room, active);
create index if not exists idx_student_questions_student on student_questions(student_id, created_at desc);
create index if not exists idx_student_prayers_student on student_prayer_requests(student_id, created_at desc);

