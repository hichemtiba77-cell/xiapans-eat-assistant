/*
 * ============================================================
 * 饭团小窝 · 共享脚本（每个页面都会加载它）
 * ============================================================
 * 这个文件管所有和「账号 / 云数据库」有关的公共逻辑，分成 6 部分：
 *   1. Supabase 配置     ★ 你唯一要改的地方在下面【第 1 部分】
 *   2. 昵称 <-> 内部代号  （Supabase 用邮箱当账号，我们把昵称换算成内部代号邮箱）
 *   3. 团子成长规则       （每餐加多少成长值、吃多少餐进化一次）
 *   4. 账号功能           （注册 / 登录 / 退出 / 登录检查）
 *   5. 喂饭 & 查询        （喂饭写云端、拉取喂养记录）
 *   6. 页面公共小部件      （导航栏右侧的昵称 + 退出按钮）
 *
 * 其他页面里的用法示例：
 *   const user = await FanFan.requireLogin();  // 门卫：没登录会被送去 login.html
 *   await FanFan.feed('番茄炒蛋盖饭');          // 喂饭并保存到云端
 *   const meals = await FanFan.getMyMeals();   // 拉取我的喂养记录
 */

// 兼容部分华为手机自带的旧版 WebView。
if (!String.prototype.padStart) {
  String.prototype.padStart = function (targetLength, padString) {
    var value = String(this);
    var pad = padString === undefined ? ' ' : String(padString);
    if (value.length >= targetLength || !pad) return value;
    return new Array(targetLength - value.length + 1).join(pad).slice(0, targetLength - value.length) + value;
  };
}
if (typeof Promise !== 'undefined' && !Promise.prototype.finally) {
  Promise.prototype.finally = function (callback) {
    var P = this.constructor;
    return this.then(
      function (value) { return P.resolve(callback()).then(function () { return value; }); },
      function (reason) { return P.resolve(callback()).then(function () { throw reason; }); }
    );
  };
}

/* ============================================================
 * 第 1 部分：Supabase 配置  ★★★ 需要你填写 ★★★
 * ------------------------------------------------------------
 * 注册/登录可用前，把下面两行的「请替换...」换成你 Supabase 项目的信息：
 *   1. 登录 https://supabase.com 打开你的项目
 *   2. 左侧 Project Settings（齿轮）-> API
 *   3. 复制 Project URL      -> 填到下面第一行
 *      复制 anon public key   -> 填到下面第二行（很长的一串）
 *
 * 这个 key 是「公开钥匙」，本来就是放在前端用的，配合数据库的
 * 安全规则（RLS）使用，别人拿到它也只能看到自己的数据。
 * ============================================================ */
const SUPABASE_URL = 'https://xiaoluo-xiaoluo.pages.dev/supabase/';
const SUPABASE_ANON_KEY = 'sb_publishable_pZ8vyr5eXSmOYJQrbB7Q4Q_4MgM3EKG';

/* ------------------------------------------------------------
 * ★ AI 聊天代理（Cloudflare Pages Function）
 * 浏览器只请求本站 /api/chat，由服务端携带智谱 API Key
 * 调用模型，前端不再保存或直接使用密钥。
 * ------------------------------------------------------------ */
const AI_API_URL = 'https://xiaoluo-xiaoluo.pages.dev/api/chat';
const ZHIPU_MODEL = 'glm-4-flash';

// 网址和内置 App 都通过线上服务端代理调用 AI。
const isAiConfigured = true;

// 判断是否已经配置好了（没配置时页面会给出提示，不会报错崩溃）
const isConfigured =
  SUPABASE_URL.indexOf('请替换') === -1 && SUPABASE_ANON_KEY.indexOf('请替换') === -1;

// 真正的数据库客户端（配置好后才会创建）
const db = isConfigured && window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

/* ============================================================
 * 第 2 部分：昵称 <-> 内部代号邮箱
 * ------------------------------------------------------------
 * Supabase 的账号体系以「邮箱」为单位，而我们的产品想用「昵称」。
 * 办法：给每个昵称算一个固定的内部代号，形如 u1a2b3c4d...@fanfan.internal
 *   - 同一个昵称永远算出同一个代号 -> 注册用它、登录也用它
 *   - 代号唯一 <=> 昵称唯一（重复注册会被 Supabase 拒绝）
 *   - 中文昵称没有影响：中文只存在「展示用的资料」里，不进代号
 * 用户全程只看到昵称，代号是幕后细节。
 * ============================================================ */

// 一种把任意文字变成固定数字的小算法（哈希）。用两种算法拼一起，
// 保证不同昵称几乎不可能算出同一个代号。
function hash32(text, seed) {
  let h = seed;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (seed === 5381) {
      h = ((h << 5) + h + c) >>> 0;          // djb2 算法
    } else {
      h = ((h ^ c) * 0x01000193) >>> 0;      // FNV-1a 算法
    }
  }
  return h.toString(16).padStart(8, '0');    // 变成 8 位十六进制
}

// 昵称 -> 内部代号邮箱
function nicknameCode(nickname) {
  const code =
    hash32(nickname, 5381) +        // 第一种哈希，8 位
    hash32(nickname, 0x811c9dc5) +  // 第二种哈希，8 位
    nickname.length.toString(16).padStart(4, '0'); // 长度也掺进去，更保险
  return 'u' + code + '@fanfan.internal';
}

/* ============================================================
 * 第 3 部分：团子成长规则（想调难度就改这里的数字）
 * ============================================================ */
const GROWTH_MIN = 8;    // 每餐最少成长值
const GROWTH_MAX = 15;   // 每餐最多成长值（随机取整数，含头含尾）
const WEIGHT_GAIN = 0.02; // 每餐长多少 kg
const BASE_WEIGHT = 1.0;  // 初始体重 kg

// 进化阶段：累计吃够 needMeals 餐就进入这一阶段（img 为该阶段的形象图片）
const STAGES = [
  { needMeals: 0,   name: '小小洛', img: 'image/pet-1.png' },
  { needMeals: 20,  name: '洛洛',   img: 'image/pet-2.png' },
  { needMeals: 50,  name: '天依',   img: 'image/pet-3.png?v=2' },
  { needMeals: 100, name: '洛天依', img: 'image/pet-4.png' },
];

// 按累计餐数算当前是第几阶段
function stageForMeals(meals) {
  let stage = 0;
  STAGES.forEach(function (s, i) {
    if (meals >= s.needMeals) stage = i;
  });
  return stage;
}

// 按当前小时判断这顿算哪一餐（写记录时用）
function mealTypeForHour(hour) {
  if (hour >= 5 && hour < 10) return '早餐';
  if (hour >= 10 && hour < 15) return '午餐';
  if (hour >= 15 && hour < 21) return '晚餐';
  return '夜宵';
}

/* ============================================================
 * 第 4 部分：账号功能
 * ============================================================ */
let cachedUser = null; // 本次页面里记住「当前登录的人」，避免反复请求

// 门卫：每个页面加载时先调它。没登录 -> 跳去 login.html，并返回 null
// 已登录 -> 返回当前用户（资料在 user.user_metadata 里）
async function requireLogin() {
  if (!db) {
    // 数据库没配置或加载失败，也送去登录页（那里会显示配置提示）
    location.replace('login.html?notice=config');
    return null;
  }
  // 先读本地会话，避免每次切页都等待一次 Auth 网络请求。
  const { data, error } = await db.auth.getSession();
  const sessionUser = data && data.session && data.session.user;
  if (error || !sessionUser) {
    location.replace('login.html');
    return null;
  }
  cachedUser = sessionUser;

  // 后台校验会话；校验失败不阻塞页面，数据仍由 RLS 保护。
  db.auth.getUser().then(function (fresh) {
    if (!fresh.error && fresh.data && fresh.data.user) cachedUser = fresh.data.user;
  }).catch(function () { });

  return sessionUser;
}

// 注册：昵称查重由 Supabase 自动完成（代号邮箱重复会报错，我们翻译成人话）
async function register(nickname, password) {
  if (!db) throw new Error('还没配置 Supabase，暂时不能注册（见 js/app.js 第 1 部分说明）');
  nickname = (nickname || '').trim();
  if (!nickname) throw new Error('先给自己起个昵称吧～');
  if (password.length < 6) throw new Error('密码至少要 6 位哦');

  const { data, error } = await db.auth.signUp({
    email: nicknameCode(nickname),
    password: password,
    // 额外资料（metadata）：昵称展示用 + 团子的初始状态都存在这里
    options: {
      data: {
        nickname: nickname,
        pet_name: '团子',
        stage: 0,
        weight: BASE_WEIGHT,
        growth_value: 0,
        total_meals: 0,
        last_fed_at: null,
      },
    },
  });

  if (error) {
    if (/already registered/i.test(error.message)) {
      throw new Error('这个昵称已经被占用啦，换一个试试～');
    }
    if (/at least \d+ characters/i.test(error.message)) {
      throw new Error('密码至少要 6 位哦');
    }
    throw new Error('注册失败：' + error.message);
  }
  // 防御：如果控制台的「邮箱验证」开关没关，注册后不会直接登录成功
  if (!data.session) {
    throw new Error('注册成功但需要邮箱验证。请到 Supabase 控制台关闭 Confirm email 开关（见配置说明）');
  }
  cachedUser = data.user;
  return data.user;
}

// 登录：昵称 + 密码
async function login(nickname, password) {
  if (!db) throw new Error('还没配置 Supabase，暂时不能登录（见 js/app.js 第 1 部分说明）');
  const { data, error } = await db.auth.signInWithPassword({
    email: nicknameCode((nickname || '').trim()),
    password: password,
  });
  if (error) {
    if (/Invalid login credentials/i.test(error.message)) {
      throw new Error('昵称或密码不对，再想想看～');
    }
    throw new Error('登录失败：' + error.message);
  }
  cachedUser = data.user;
  return data.user;
}

// 退出登录
async function logout() {
  if (db) await db.auth.signOut();
  cachedUser = null;
  location.href = 'login.html';
}

/* ============================================================
 * 第 5 部分：喂饭 & 查询
 * ============================================================ */

// 喂饭：1) 往 meals 表插一条记录  2) 更新团子状态（存在用户资料里）
// 返回本次喂饭的结果（加了多少成长值、有没有进化等），页面拿去刷新界面
async function feed(foodName) {
  let user = cachedUser;
  if (!user) {
    user = await requireLogin();
    if (!user) throw new Error('登录状态失效了，刷新页面重新登录试试');
  }
  // 重要：先从云端拉一次最新资料再计算。否则连续喂饭时，
  // 上一次喂完还没刷新缓存，会用旧值重复计算（餐数不长、体重不变）
  const fresh = await db.auth.getUser();
  if (fresh.data && fresh.data.user) user = fresh.data.user;
  cachedUser = user;

  const meta = user.user_metadata || {};
  const now = new Date();
  const gain = GROWTH_MIN + Math.floor(Math.random() * (GROWTH_MAX - GROWTH_MIN + 1)); // 随机 8~15
  const totalMeals = (meta.total_meals || 0) + 1;
  const growthValue = (meta.growth_value || 0) + gain;
  const weight = Math.round(((meta.weight == null ? BASE_WEIGHT : meta.weight) + WEIGHT_GAIN) * 100) / 100;
  const newStage = stageForMeals(totalMeals);

  // 1) 喂养记录写进 meals 表。user_id 必须显式带上"这是谁喂的"：
  //    数据库安全规则会用 auth.uid() = user_id 校验，没带或带别人的都会被拒绝
  const mealPayload = {
    user_id: user.id,
    food_name: foodName,
    meal_type: mealTypeForHour(now.getHours()),
    growth_gain: gain,
    weight_after: weight,
  };
  const { error: mealErr } = await db.from('meals').insert(mealPayload);
  if (mealErr) throw new Error('保存喂养记录失败：' + mealErr.message);

  // 同步更新本页的本地记录缓存，下一次进入日记页可立即显示。
  try {
    const cacheKey = 'fanfan-meals-cache-' + user.id;
    const cachedRows = JSON.parse(localStorage.getItem(cacheKey) || '[]');
    if (Array.isArray(cachedRows)) {
      cachedRows.unshift(Object.assign({
        id: 'local-' + now.getTime(),
        created_at: now.toISOString(),
      }, mealPayload));
      localStorage.setItem(cacheKey, JSON.stringify(cachedRows.slice(0, 500)));
    }
  } catch (e) { }

  // 2) 团子的最新状态存进用户资料（metadata）
  const { data, error } = await db.auth.updateUser({
    data: {
      growth_value: growthValue,
      total_meals: totalMeals,
      weight: weight,
      stage: newStage,
      last_fed_at: now.toISOString(),
    },
  });
  if (error) throw new Error('更新团子状态失败：' + error.message);

  cachedUser = data.user; // 记下最新状态，供下一次喂饭使用

  return {
    user: data.user,
    gain: gain,
    totalMeals: totalMeals,
    growthValue: growthValue,
    weight: weight,
    stage: newStage,
    evolved: newStage > (meta.stage || 0), // 这次喂完阶段变了 = 进化啦
  };
}

// 拉取我的喂养记录（最新的在前）。limit 不填就取最近 500 条
async function getMyMeals(limit) {
  if (!db) return [];
  const maxRows = limit || 500;
  const user = cachedUser;
  const cacheKey = user ? 'fanfan-meals-cache-' + user.id : '';
  let cachedRows = null;
  if (cacheKey) {
    try {
      cachedRows = JSON.parse(localStorage.getItem(cacheKey) || 'null');
      if (!Array.isArray(cachedRows)) cachedRows = null;
    } catch (e) { cachedRows = null; }
  }

  const query = db
    .from('meals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(maxRows);

  // 有缓存就先返回，网络请求在后台更新缓存，切页不再等数据。
  if (cachedRows) {
    query.then(function (result) {
      if (!result.error && cacheKey) {
        try { localStorage.setItem(cacheKey, JSON.stringify(result.data || [])); } catch (e) { }
      }
    }).catch(function () { });
    return cachedRows.slice(0, maxRows);
  }

  const { data, error } = await query;
  if (error) throw new Error('读取喂养记录失败：' + error.message);
  if (cacheKey) {
    try { localStorage.setItem(cacheKey, JSON.stringify(data || [])); } catch (e) { }
  }
  return data || [];
}

// 连续好好吃饭的天数：从今天（或昨天）往前数，每天至少吃过一顿就 +1
function streakDays(meals) {
  const daySet = {};
  meals.forEach(function (m) {
    daySet[new Date(m.created_at).toDateString()] = true;
  });
  const day = new Date();
  // 今天还没吃不打断连续记录，从昨天开始数也成立
  if (!daySet[day.toDateString()]) day.setDate(day.getDate() - 1);
  let streak = 0;
  while (daySet[day.toDateString()]) {
    streak++;
    day.setDate(day.getDate() - 1);
  }
  return streak;
}

// 本周（周一到今天）吃了几餐
function weekMealCount(meals) {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // 回到这周一
  monday.setHours(0, 0, 0, 0);
  let count = 0;
  meals.forEach(function (m) {
    if (new Date(m.created_at) >= monday) count++;
  });
  return count;
}

/* ============================================================
 * 第 6 部分：页面公共小部件
 * ============================================================ */

// 往导航栏的 #user-area 里填「昵称 + 退出按钮」
// （每个页面的页头里都预留了 <div id="user-area"></div>）
function injectNavUser(user) {
  const area = document.getElementById('user-area');
  if (!area || !user) return;
  const nickname = (user.user_metadata && user.user_metadata.nickname) || '小伙伴';
  area.innerHTML =
    '<span class="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container text-on-surface text-sm font-medium border border-outline-variant/30">' +
    '<i data-lucide="user-round" class="w-4 h-4 text-primary"></i>' +
    '<span>' + nickname + '</span>' +
    '</span>' +
    '<button id="btn-logout" type="button" title="退出登录"' +
    ' class="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors">' +
    '<i data-lucide="log-out" class="w-4 h-4"></i>退出' +
    '</button>';
  const btn = document.getElementById('btn-logout');
  if (btn) btn.addEventListener('click', logout);
  if (window.lucide) window.lucide.createIcons();
}

// 四个主页面共用的底部导航。首页保留原有导航，其余页面动态注入。
function injectBottomNav() {
  const page = (location.pathname.split('/').pop() || 'home').replace(/\.html$/, '') || 'home';
  if (!['stats', 'diary', 'chat'].includes(page)) return;
  if (document.getElementById('app-bottom-nav')) return;

  const items = [
    { id: 'home', label: '首页', href: 'home.html', icon: '<path d=\'M4 11l8-7 8 7\'/><path d=\'M6 10v9h12v-9\'/><path d=\'M10 19v-5h4v5\'/>' },
    { id: 'stats', label: '成长', href: 'stats.html', icon: '<path d=\'M4 20q6 2 10-2M6 16q1-5 6-5M18 4q2 6-3 9M9 20h6\'/>' },
    { id: 'diary', label: '日记', href: 'diary.html', icon: '<path d=\'M5 5a2 2 0 0 1 2-2h12v18H7a2 2 0 0 1-2-2Z\'/><path d=\'M5 17h14\'/><path d=\'M9 7h6M9 11h6\'/>' },
    { id: 'chat', label: '陪伴', href: 'chat.html', icon: '<path d=\'M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5Z\'/><circle cx=\'9\' cy=\'12\' r=\'0.5\' fill=\'#4A4038\'/><circle cx=\'13\' cy=\'12\' r=\'0.5\' fill=\'#4A4038\'/><circle cx=\'17\' cy=\'12\' r=\'0.5\' fill=\'#4A4038\'/>' },
  ];

  const links = items.map(function (item) {
    const active = item.id === page;
    return '<a href=\'' + item.href + '\' class=\'flex flex-col items-center gap-1 w-14\' ' +
      (active ? 'aria-current=\'page\'' : '') + '>' +
      '<span class=\'w-11 h-11 rounded-2xl flex items-center justify-center ' +
      (active ? 'bg-primary-container/80 border-2 border-on-surface/50' : '') + '\'>' +
      '<svg class=\'w-6 h-6\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'#4A4038\' stroke-width=\'2.2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'>' + item.icon + '</svg>' +
      '</span>' +
      '<span class=\'text-xs ' + (active ? 'font-bold text-primary' : 'text-on-surface-variant') + '\'>' + item.label + '</span>' +
      '</a>';
  }).join('');

  const nav = document.createElement('nav');
  nav.id = 'app-bottom-nav';
  nav.className = 'fixed left-0 right-0 bottom-0 z-50';
  nav.innerHTML =
    '<div class=\'mx-auto max-w-[440px] bg-white border-t-[3px] border-x-[3px] border-on-surface/50 rounded-t-[34px] px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-start justify-around\'>' +
    links + '</div>';
  document.body.appendChild(nav);
  document.body.classList.add('has-app-bottom-nav');

  const style = document.createElement('style');
  style.id = 'app-bottom-nav-style';
  style.textContent =
    'body.has-app-bottom-nav { padding-bottom: calc(84px + env(safe-area-inset-bottom)); }' +
    'body.has-app-bottom-nav #chat-card { height: calc(100vh - 12.5rem) !important; height: calc(100dvh - 12.5rem) !important; min-height: 420px !important; }' +
    '@media (max-width: 639px) { body.has-app-bottom-nav #chat-card { min-height: 380px !important; } }';
  document.head.appendChild(style);
}

document.addEventListener('DOMContentLoaded', injectBottomNav);

// 缓存页面外壳，让 App 内切页不再每次等待网络。
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(function () { });
}

/* ============================================================
 * 第 5.5 部分：AI 陪伴对话（智谱 glm-4-flash）
 * ============================================================ */

// 流式调用本站 AI 代理。messages = [{role:'system'|'user'|'assistant', content}]
// 每收到一小段回复就调用一次 onDelta(增量文本)，整体返回完整回复。
// SSE 格式：每行 "data: {json}"，delta.content 是本次新增的文字
async function aiStream(messages, onDelta) {
  const res = await fetch(AI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: ZHIPU_MODEL,
      messages: messages,
      stream: true,
      temperature: 0.9,
      max_tokens: 120, // 限制回复长度，符合"简短回应"的产品设定
    }),
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 200); } catch (e) { }
    throw new Error('AI 接口返回 ' + res.status + (detail ? '：' + detail : ''));
  }
  if (!res.body) throw new Error('AI 接口没有返回可读取的数据流');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '', full = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop(); // 最后一段可能不完整，留到下一轮
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const payload = t.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const j = JSON.parse(payload);
        const delta = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
        if (delta) { full += delta; if (onDelta) onDelta(delta); }
      } catch (e) { /* 忽略无法解析的行 */ }
    }
  }
  return full;
}

// 组装小洛的系统提示词：人设（任何话题都聊）+ 用户真实资料 + 最近吃的饭
async function buildPetSystemPrompt() {
  const user = cachedUser;
  const meta = (user && user.user_metadata) || {};
  const nickname = meta.nickname || '小伙伴';
  const meals = meta.total_meals || 0;
  const petName = STAGES[stageForMeals(meals)].name;

  // 拉最近 5 餐 + 数今天吃了几餐
  let recentText = '还没有任何吃饭记录';
  let todayCount = 0;
  try {
    const rows = await getMyMeals(20);
    const today = new Date().toDateString();
    todayCount = rows.filter(function (m) { return new Date(m.created_at).toDateString() === today; }).length;
    if (rows.length) {
      recentText = rows.slice(0, 5).map(function (m) {
        const d = new Date(m.created_at);
        return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' +
          String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') +
          ' 吃了「' + m.food_name + '」';
      }).join('；');
    }
  } catch (e) { /* 拉不到就不提 */ }

  return '你是「' + petName + '」，用户' + nickname + '的虚拟吃饭小伙伴，一只软萌治愈的小生物（当前形态：' + petName + '）。' +
    '你的任务：陪用户聊天、提醒并陪伴用户好好吃饭。\n' +
    '要求：\n' +
    '1. 无论用户聊什么话题（学习、游戏、心情、烦恼、知识问答……）都要自然接住，热情回应；\n' +
    '2. 每次回复只说 1~2 句话，总共不超过 40 个字，简短可爱；\n' +
    '3. 语气软萌温暖，可以适当用「～」「啦」「呀」等语气词，但不要刷屏表情；\n' +
    '4. 不说教、不评判用户的饮食，吃得少也要温柔鼓励；\n' +
    '5. 可以自然提起用户的吃饭情况（见下方资料），但每次回复最多提一次。\n' +
    '【用户资料】今天已吃 ' + todayCount + ' 餐，累计 ' + meals + ' 餐。\n' +
    '【最近吃过的】' + recentText;
}

function chatCacheKey(user) {
  return 'fanfan-chat-cache-' + user.id;
}

function readChatCache(user) {
  try {
    const rows = JSON.parse(localStorage.getItem(chatCacheKey(user)) || '[]');
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    return [];
  }
}

function writeChatCache(user, rows) {
  try {
    const sorted = rows.slice().sort(function (a, b) {
      return new Date(a.created_at || 0) - new Date(b.created_at || 0);
    });
    localStorage.setItem(chatCacheKey(user), JSON.stringify(sorted.slice(-100)));
  } catch (e) { }
}

// 写库前刷新当前用户，避免页面上仍显示登录但会话已过期的静默失败。
async function ensureFreshUser() {
  if (!db) throw new Error('数据库尚未配置');
  const fresh = await db.auth.getUser();
  if (!fresh.error && fresh.data && fresh.data.user) {
    cachedUser = fresh.data.user;
    return fresh.data.user;
  }
  const refreshed = await db.auth.refreshSession();
  if (!refreshed.error && refreshed.data && refreshed.data.user) {
    cachedUser = refreshed.data.user;
    return refreshed.data.user;
  }
  throw new Error('登录状态已过期，请重新登录');
}

async function flushPendingChat(user) {
  const rows = readChatCache(user);
  let changed = false;
  if (!rows.some(function (row) { return row.pending; })) return;

  await ensureFreshUser();
  for (const row of rows) {
    if (!row.pending) continue;
    const { error } = await db.from('chat_messages').insert({
      user_id: user.id,
      role: row.role,
      content: row.content,
      created_at: row.created_at,
    });
    if (!error) {
      row.pending = false;
      changed = true;
    }
  }
  if (changed) writeChatCache(user, rows);
}

// 读写聊天记录：本地先返回，云端在后台同步；失败消息保留待下次重试。
async function getChatHistory(limit) {
  const user = cachedUser;
  if (!user) return [];
  const maxRows = limit || 50;
  const cachedRows = readChatCache(user);

  async function loadCloud() {
    await flushPendingChat(user).catch(function () { });
    const { data, error } = await db.from('chat_messages')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(100);
    if (error) throw new Error(error.message);
    const pending = readChatCache(user).filter(function (row) { return row.pending; });
    const merged = (data || []).concat(pending).sort(function (a, b) {
      return new Date(a.created_at || 0) - new Date(b.created_at || 0);
    });
    writeChatCache(user, merged);
    return merged.slice(-maxRows);
  }

  if (cachedRows.length) {
    loadCloud().catch(function (e) { console.warn('聊天记录后台同步失败:', e.message); });
    return cachedRows.slice(-maxRows);
  }
  return loadCloud();
}

async function saveChat(role, content) {
  const user = cachedUser || await requireLogin();
  if (!user) throw new Error('登录状态已失效');
  const row = {
    id: 'local-' + Date.now() + '-' + Math.random().toString(16).slice(2),
    user_id: user.id,
    role: role,
    content: content,
    created_at: new Date().toISOString(),
    pending: true,
  };
  const rows = readChatCache(user);
  rows.push(row);
  writeChatCache(user, rows);

  try {
    await ensureFreshUser();
    const { error } = await db.from('chat_messages').insert({
      user_id: user.id,
      role: role,
      content: content,
      created_at: row.created_at,
    });
    if (error) throw error;
    row.pending = false;
    writeChatCache(user, readChatCache(user).map(function (item) {
      return item.id === row.id ? row : item;
    }));
    return row;
  } catch (error) {
    throw new Error('聊天记录暂时未同步：' + error.message);
  }
}

/* ============================================================
 * 对外暴露：其他页面通过 FanFan.xxx 使用这里的所有功能
 * ============================================================ */
window.FanFan = {
  db: db,
  isConfigured: isConfigured,
  isAiConfigured: isAiConfigured,
  aiStream: aiStream,
  buildPetSystemPrompt: buildPetSystemPrompt,
  getChatHistory: getChatHistory,
  saveChat: saveChat,
  STAGES: STAGES,
  GROWTH_MIN: GROWTH_MIN,
  GROWTH_MAX: GROWTH_MAX,
  WEIGHT_GAIN: WEIGHT_GAIN,
  BASE_WEIGHT: BASE_WEIGHT,
  nicknameCode: nicknameCode,
  stageForMeals: stageForMeals,
  mealTypeForHour: mealTypeForHour,
  requireLogin: requireLogin,
  register: register,
  login: login,
  logout: logout,
  feed: feed,
  getMyMeals: getMyMeals,
  streakDays: streakDays,
  weekMealCount: weekMealCount,
  injectNavUser: injectNavUser,
  injectBottomNav: injectBottomNav,
};
