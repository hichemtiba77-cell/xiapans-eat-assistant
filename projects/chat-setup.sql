-- ============================================================
-- 小洛小洛 · 聊天记录表（接入 AI 陪伴对话用）
-- ============================================================
-- 使用方法（一次性操作，和上次建 meals 表一样）：
--   1. 打开 Supabase 项目 -> 左侧「SQL Editor」
--   2. New query，把整个文件内容粘贴进去
--   3. 点 Run，提示 Success 即完成
-- ============================================================

-- 1) 聊天记录表：role=谁说的（user=主人 / pet=小洛），content=内容
create table if not exists public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade, -- 属于哪个用户
  role       text not null check (role in ('user', 'pet')),
  content    text not null,
  created_at timestamptz not null default now()
);

-- 2) 安全规则（RLS）：每人只能读写自己的聊天记录
alter table public.chat_messages enable row level security;

drop policy if exists "查看自己的聊天记录" on public.chat_messages;
create policy "查看自己的聊天记录"
  on public.chat_messages for select
  using (auth.uid() = user_id);

drop policy if exists "新增自己的聊天记录" on public.chat_messages;
create policy "新增自己的聊天记录"
  on public.chat_messages for insert
  with check (auth.uid() = user_id);

drop policy if exists "删除自己的聊天记录" on public.chat_messages;
create policy "删除自己的聊天记录"
  on public.chat_messages for delete
  using (auth.uid() = user_id);
