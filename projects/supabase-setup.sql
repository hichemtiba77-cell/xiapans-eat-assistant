-- ============================================================
-- 饭团小窝 · Supabase 数据库初始化脚本
-- ============================================================
-- 使用方法（一次性操作）：
--   1. 打开你的 Supabase 项目 -> 左侧「SQL Editor」
--   2. 新建查询，把整个文件内容粘贴进去
--   3. 点 Run（运行），提示 Success 即完成
--
-- 这个脚本做两件事：
--   1. 建一张 meals 表，存放每一条喂养记录
--   2. 开启 RLS 安全规则：每个用户只能读写「自己的」记录，
--      就算别人拿到了公开 key 也看不到你的数据
-- ============================================================

-- 1) 建喂养记录表
create table if not exists public.meals (
  id           uuid primary key default gen_random_uuid(), -- 记录编号（自动生成）
  user_id      uuid not null references auth.users(id) on delete cascade, -- 谁喂的（自动关联当前登录用户）
  food_name    text not null,                -- 吃了什么
  meal_type    text not null default '加餐', -- 早餐/午餐/晚餐/夜宵
  growth_gain  int  not null default 0,      -- 这一餐长了多少成长值
  weight_after numeric(5,2) not null default 0, -- 吃完后团子的体重（画体重曲线用）
  created_at   timestamptz not null default now() -- 什么时候喂的（自动记录）
);

-- 2) 开启行级安全（RLS）：数据隔离的根本
alter table public.meals enable row level security;

-- 3) 安全规则：只能看自己的记录
drop policy if exists "查看自己的喂养记录" on public.meals;
create policy "查看自己的喂养记录"
  on public.meals for select
  using (auth.uid() = user_id);

-- 4) 安全规则：只能往自己名下写记录
drop policy if exists "新增自己的喂养记录" on public.meals;
create policy "新增自己的喂养记录"
  on public.meals for insert
  with check (auth.uid() = user_id);

-- 5) 安全规则：只能删自己的记录（以后做"删除记录"功能用）
drop policy if exists "删除自己的喂养记录" on public.meals;
create policy "删除自己的喂养记录"
  on public.meals for delete
  using (auth.uid() = user_id);

-- 完成！现在回到网页就能正常注册、登录、喂饭了。
-- 想看数据：Supabase 控制台 -> Table Editor -> meals 表
