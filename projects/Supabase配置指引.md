# Supabase 配置指引（一次性的准备工作）

照着做一遍大约 10 分钟。做完之后，网站的注册 / 登录 / 喂饭数据就全部真实可用了。

---

## 第 1 步：注册 Supabase 并新建项目

1. 打开 [https://supabase.com](https://supabase.com)，点 **Start your project**（开始）注册账号（用邮箱即可，需要邮箱验证码）
2. 登录后点 **New project**（新建项目）：
   - **Name**：随便起，比如 `fanfan`
   - **Database Password**：设置一个数据库密码（随便什么，自己记住，项目里用不到它）
   - **Region**：选 **Singapore（新加坡）**，国内访问相对快
3. 点 **Create new project**，等 1~2 分钟初始化完成

> 免费额度够用。注意：免费项目**连续 7 天没人访问会自动暂停**（数据不会丢），
> 控制台里点 **Restore** 恢复即可。要给同学/老师演示前，提前一天打开一下。

## 第 2 步：关闭「邮箱验证」开关（重要，不关注册不了）

Supabase 默认注册后要收验证邮件，我们的产品用不到（昵称+密码直接进），关掉它：

1. 左侧菜单 **Authentication**（认证）→ **Sign In / Providers**
2. 找到 **Email** 这一栏，点开
3. 把 **Confirm email**（确认邮箱）的开关 **关掉**
4. 点 **Save**

## 第 3 步：把项目密钥填进代码

1. 左侧菜单 **Project Settings**（齿轮图标）→ **API**
2. 复制两样东西：
   - **Project URL**：形如 `https://abcd1234.supabase.co`
   - **anon public key**：下面那串很长的 `eyJ...` 开头的密钥（注意是 anon/public 这个，不是 service_role）
3. 打开项目里的 `js/app.js`，找到最上面的【第 1 部分】，把两行「请替换...」换成刚才复制的内容：

```js
const SUPABASE_URL = 'https://abcd1234.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOi...(你的完整密钥)';
```

> 放心：这个 anon key 本来就是设计成放前端的「公开钥匙」，
> 真正保护数据的是第 4 步的安全规则，别人拿到 key 也只能看到自己的数据。

## 第 4 步：执行建表脚本

1. 左侧菜单 **SQL Editor**
2. 点 **New query**（新建查询）
3. 打开项目里的 `supabase-setup.sql`，**全选复制**，粘贴进去
4. 点 **Run**（运行），出现 `Success` 即完成

这一步创建了 `meals` 喂养记录表，并开启安全规则（每人只能读写自己的记录）。

## 第 5 步：验证

1. 本地启动：`python serve.py`，浏览器打开 `http://127.0.0.1:8000`（端口以命令行输出为准）
   （serve.py 是带"禁用缓存"的开发服务器，改完代码刷新就能看到最新版，不会有缓存困扰）
2. 这时登录页的黄色「还没连接数据库」提示条应该消失了
3. 注册一个昵称 → 进首页喂两顿饭 → 刷新页面数据还在 → 成长页/日记页出现真实记录 ✅

## 部署到扣子之后

Supabase **不需要**配置域名白名单，扣子一键部署后直接就能用，没有额外步骤。

想看数据：Supabase 控制台 → **Table Editor** → `meals` 表（喂养记录），
用户和团子状态在 **Authentication** → **Users** 里（点开某个用户能看到 Raw user meta data）。

---

## 常见问题

| 现象 | 原因和解决 |
|---|---|
| 注册时提示「需要邮箱验证」 | 第 2 步的 Confirm email 没关 |
| 注册提示「这个昵称已经被占用」 | 昵称重复了，Supabase 自动查重生效，换个昵称 |
| 登录提示「昵称或密码不对」 | 检查输入；昵称大小写敏感 |
| 页面全是 0 / 加载失败 | `js/app.js` 的 URL 或 key 填错了；或第 4 步 SQL 没跑 |
| 项目打不开/请求超时 | 免费项目可能被暂停了，去控制台点 **Restore** |
