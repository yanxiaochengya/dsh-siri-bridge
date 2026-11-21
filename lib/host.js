// DSH「Siri 语音桥」· 宿主半边
//
// 干的事和原来那个 siri-bridge.mjs 一样：起一个小 HTTP 服务，给 iPhone 快捷指令用。
//   GET /siri-bridge/say?a=一句话   → 送进 DSH 的某一间会话，立刻返回 ok
//   GET /siri-bridge/wait           → 长轮询，等我的新回复（没等到返回「还在想」）
//   GET /siri-bridge/reply          → 直接取最近一条（调试用）
//   GET /siri-bridge/sessions       → 列出可选的会话
//
// 区别：现在它住在 DSH 里，跟着 DSH 一起起停，配置和日志都在设置页能看能改。
//
// ⚠ 安全默认：总开关 = false，不手动打开，一个端口都不开。

import { readFileSync, writeFileSync, mkdirSync, existsSync, openSync, readSync, closeSync, readdirSync } from 'node:fs'
import { homedir, networkInterfaces } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'
import { execFile } from 'node:child_process'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

export const name = 'siri-bridge'

/** 需要宿主提供：webServer（设置页路由）+ sessions（会话清单）+ agents（往会话里送话）。 */
export const inject = ['agents', 'sessions', 'sessionTitle', 'webServer']

const 目录 = process.env.DSH_HOME || join(homedir(), '.dsh')
const 配置文件 = join(目录, 'siri-bridge-config.json')
const 基线文件 = join(目录, 'siri-bridge-baseline.json')
const 路由前缀 = '/dsh-siri-bridge'
const 日志上限 = 200

const 默认配置 = {
  总开关: false, // 关着 = 一个端口都不开（安全默认）
  端口: 3919, // 快捷指令里就是 http://<电脑IP>:3919/say?a=...
  监听: '0.0.0.0', // 0.0.0.0 = 同一局域网 / Tailscale 都连得上
  会话: '', // 送进哪一间会话（留空 = 设置页里选一间点「设为目标」）
  等待超时秒: 120, // /wait 默认最多等多久
  轮询毫秒: 100, // 多久去看一眼有没有新回复
  口令: '', // 可选：填了以后，请求要带 ?t=口令 或者头 X-Siri-Token
  远程地址: '', // 手机在外面用的地址（Tailscale 的 100.x 或域名），留空 = 只用局域网
  别名: {}, // 会话 id → 你自己起的名字（内核不给标题时用来认人，只存本机）
}

function 读JSON(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    return fallback
  }
}

function 写JSON(file, data) {
  try {
    mkdirSync(dirname(file), { recursive: true })
    // 无 BOM 的 UTF-8——带 BOM 会让宿主读配置时炸掉
    writeFileSync(file, JSON.stringify(data, null, 2), { encoding: 'utf8' })
    return true
  } catch (error) {
    return false
  }
}

/** 看一眼网卡名和地址，猜出它是啥（设置页里给用户看人话） */
function 判断类型(名, 地址) {
  const n = String(名 || '').toLowerCase()
  if (n.includes('tailscale') || /^100\./.test(地址)) return 'Tailscale（出门也能连）'
  if (n.includes('wlan') || n.includes('wi-fi') || n.includes('无线') || n.includes('wifi')) return 'WiFi（同一局域网）'
  if (n.includes('ethernet') || n.includes('以太')) return '有线网'
  if (/^192\.168\.137\./.test(地址)) return '手机热点'
  if (/^169\.254\./.test(地址)) return '没连上网'
  return '其他网卡'
}

/** 跑个命令，超时就当没结果 */
function 跑(cmd, args, 超时 = 8000) {
  return new Promise((resolve) => {
    try {
      execFile(cmd, args, { timeout: 超时, windowsHide: true }, (err, stdout) => {
        resolve(err ? '' : String(stdout || ''))
      })
    } catch (error) {
      resolve('')
    }
  })
}

/**
 * 「自动查找地址」：把能连上这台电脑的地址全找出来。
 * 方法：读网卡 + 读路由表(知道网关) + 读 ARP 邻居表(知道局域网里有哪些设备) + 问 tailscale。
 * 都不需要管理员权限，也不会扫端口。
 */
async function 探查网络() {
  const 地址 = []
  try {
    const ifs = networkInterfaces()
    for (const 名 of Object.keys(ifs)) {
      for (const a of ifs[名] || []) {
        if (a.family === 'IPv4' && !a.internal) 地址.push({ 网卡: 名, 地址: a.address, 类型: 判断类型(名, a.address) })
      }
    }
  } catch (error) {}

  const 首选 = 地址.find((x) => x.类型.startsWith('WiFi')) || 地址.find((x) => x.类型.startsWith('Tailscale')) || 地址[0] || null

  const [route, arp, ts] = await Promise.all([
    跑('cmd', ['/c', 'route', 'print', '-4']),
    跑('cmd', ['/c', 'arp', '-a']),
    跑('tailscale', ['ip', '-4'], 4000),
  ])

  const 网关列表 = []
  for (const 行 of route.split(/\r?\n/)) {
    const m = 行.trim().match(/^0\.0\.0\.0\s+0\.0\.0\.0\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+)/)
    if (m) 网关列表.push({ 网关: m[1], 本机: m[2] })
  }

  const 邻居 = []
  for (const 行 of arp.split(/\r?\n/)) {
    const m = 行.trim().match(/^(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F-]{11,17})\s+(\S+)/)
    if (m) 邻居.push({ 地址: m[1], MAC: m[2], 方式: m[3] })
  }

  const Tailscale地址 = 地址.filter((x) => x.类型.startsWith('Tailscale')).map((x) => x.地址)

  return { 地址, 首选, 网关列表, 邻居, Tailscale地址, tailscale命令行: ts.trim() }
}

/** 按配置把「能填进快捷指令」的完整地址排好序 */
function 给出地址(配置, 网) {
  const 端口 = Number(配置.端口) || 3919
  const out = []
  const 加 = (地址, 说明, 优先) => {
    if (!地址) return
    out.push({
      地址: `http://${地址}:${端口}`,
      说明,
      优先,
      发: `http://${地址}:${端口}/say?a=`,
      收: `http://${地址}:${端口}/wait`,
      测试: `http://${地址}:${端口}/ping`,
    })
  }
  if (配置.远程地址) 加(String(配置.远程地址).trim().replace(/^https?:\/\//, ''), '自己填的远程地址', 0)
  for (const a of 网?.地址 || []) 加(a.地址, a.类型, a.类型.startsWith('WiFi') ? 1 : a.类型.startsWith('Tailscale') ? 2 : 3)
  out.sort((a, b) => a.优先 - b.优先)
  return out
}

/** 本机所有非内网回环的 IPv4，设置页里给用户挑着用 */
function 本机地址们() {
  const out = []
  try {
    const ifs = networkInterfaces()
    for (const 名 of Object.keys(ifs)) {
      for (const a of ifs[名] || []) {
        if (a.family === 'IPv4' && !a.internal) out.push({ 网卡: 名, 地址: a.address })
      }
    }
  } catch (error) {}
  return out
}

/**
 * 插件入口。
 * cordis 会带着 ctx（需要 webServer / agents / sessions），没有 ctx 就是被 import 了一下，什么也不做。
 */
export function apply(ctx) {
  if (!ctx) return

  const 日志 = []
  const 状态 = { 服务: null, 端口: null, 起于: null, 最后错误: '' }
  let 基线 = 读JSON(基线文件, null)
  // 实时收到的「我最近说的一句」——由 session/event 事件填，比轮询会话历史可靠
  let 最近回复 = null
  const 原始事件缓存 = []
  // 每次送话的流水（用来核对到底是以什么身份送进去的）
  const 送话日志 = []

  const 记账 = (说) => {
    const 行 = { 时间: new Date().toISOString(), 说: String(说) }
    日志.push(行)
    if (日志.length > 日志上限) 日志.splice(0, 日志.length - 日志上限)
    try { console.log('[siri-bridge] ' + 行.说) } catch (error) {}
  }

  const 读配置 = () => {
    const 存 = 读JSON(配置文件, {})
    const 合 = { ...默认配置 }
    for (const k of Object.keys(默认配置)) {
      if (存[k] !== undefined) 合[k] = 存[k]
    }
    return 合
  }

  /** 检查配置有没有问题（设置页会照着显示红字，照抄时不用猜） */
  const 检查配置 = (c) => {
    const 问题 = []
    const 端口 = Number(c?.端口) || 0
    if (!c?.总开关) 问题.push('总开关是关着的，服务不会起')
    if (端口 < 1 || 端口 > 65535) 问题.push('端口不合法（1~65535）')
    const 会话 = String(c?.会话 || '').trim()
    if (!会话) 问题.push('还没选会话，手机发过来的话进不去')
    else if (!找agent(会话)) 问题.push('选中的会话现在找不到（可能被删了或没打开），重新选一间')
    return 问题
  }

  const 写配置 = (data) => {
    const 合 = { ...默认配置, ...(data || {}) }
    写JSON(配置文件, 合)
    return 合
  }

  // ---------- 会话相关 ----------

  /** 会话日志的存储目录：用来读「会话头」里的标题/预览等元信息 */
  const 会话根目录 = () => {
    let 根 = ''
    for (const 名 of ['sessionPersistence', 'sessionStore', 'sessionLog', 'persistence']) {
      try {
        const 件 = ctx.get(名)
        const 配 = 件?.config
        if (配 && typeof 配.root === 'string' && 配.root !== '') { 根 = 配.root; break }
      } catch (error) {}
    }
    if (!根) {
      // 宿主默认就在 <DSH 家目录>/sessions
      const 家 = process.env.DSH_HOME || process.env.DSH_DATA_DIR || 目录
      if (家) 根 = String(家).replace(/[\\/]+$/, '') + '/sessions'
    }
    return 根
  }

  /** 会话日志的真实位置：<根>/<工作目录哈希>/<会话id>/session.v4.jsonl.zstd 这种分层结构 */
  const 找会话日志 = (id) => {
    const 根 = 会话根目录()
    if (!根 || !existsSync(根)) return null
    const 简 = id.replace(/^session-/, '')
    const 算命中 = (名) => 名 === id || 名 === 简 || 名.endsWith(id) || 名.endsWith(简)
    try {
      for (const 子 of readdirSync(根, { withFileTypes: true })) {
        if (!子.isDirectory()) continue
        const 层 = `${根}/${子.name}`
        for (const 孙 of readdirSync(层, { withFileTypes: true })) {
          if (!孙.isDirectory() || !算命中(孙.name)) continue
          const 里 = `${层}/${孙.name}`
          try {
            const 文件们 = readdirSync(里).filter((x) => /\.jsonl/.test(x))
            // 未压缩的 .jsonl 优先（能直接读出文字）
            文件们.sort((a, b) => (/\.jsonl$/.test(a) ? -1 : 1) - (/\.jsonl$/.test(b) ? -1 : 1))
            if (文件们.length) return `${里}/${文件们[0]}`
          } catch (error) {}
        }
      }
    } catch (error) {}
    // 再试一遍平铺结构，有的版本直接把日志放在根下
    for (const f of [`${根}/${id}.jsonl.zstd`, `${根}/${id}.jsonl`, `${根}/${简}.jsonl.zstd`]) {
      try { if (existsSync(f)) return f } catch (error) {}
    }
    return null
  }

  const 时间戳 = (v) => {
    if (v == null) return ''
    try {
      const ms = typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(String(v))
      if (!Number.isFinite(ms)) return ''
      const d = new Date(ms)
      const 两位 = (n) => String(n).padStart(2, '0')
      return `${d.getMonth() + 1}/${d.getDate()} ${两位(d.getHours())}:${两位(d.getMinutes())}`
    } catch (error) { return '' }
  }

  // 每个会话最多读这么多字节去找标题，别把大日志整份读进内存
  const 读头上限 = 96 * 1024
  // 解压出来的文本最多留这么多，够找头部事件就行
  const 解压上限 = 256 * 1024

  /** 日志是 zstd 压缩的，交给系统的 tar 解一小段回来（Node 没自带 zstd 解压） */
  const 解zstd一小段 = (文件) => {
    try {
      const 输出 = execFileSync('tar', ['-xf', 文件, '-O'], {
        maxBuffer: 解压上限,
        timeout: 4000,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      return Buffer.isBuffer(输出) ? 输出.toString('utf8') : String(输出 || '')
    } catch (error) {
      // maxBuffer 超了没关系，前面的内容已经拿到了
      const 已拿 = error && error.stdout
      if (已拿 && 已拿.length) return Buffer.from(已拿).toString('utf8')
      return ''
    }
  }

  /** 从会话日志开头找「会话头」里的标题、首句话、时间、工作目录 */
  const 读会话头 = (id) => {
    const 文件 = 找会话日志(id)
    if (!文件) return null
    let 原文 = ''
    if (/\.jsonl$/.test(文件)) {
      try {
        const fd = openSync(文件, 'r')
        const 缓冲 = Buffer.alloc(读头上限)
        const n = readSync(fd, 缓冲, 0, 读头上限, 0)
        closeSync(fd)
        原文 = 缓冲.subarray(0, n).toString('utf8')
      } catch (error) { return null }
    } else {
      原文 = 解zstd一小段(文件)
      if (!原文) return null
    }
    // 只认 JSON 文本行；zstd 压缩过的开头不是 JSON，自然就跳过了
    const 行们 = 原文.split(/\r?\n/).slice(0, 40)
    for (const 行 of 行们) {
      if (!行 || 行[0] !== '{') continue
      let 甲 = null
      try { 甲 = JSON.parse(行) } catch (error) { continue }
      const d = 甲?.data || 甲
      const 头 = d?.header || d?.session?.header || (d?.createdAt || d?.cwd ? d : null)
      if (!头) continue
      const o = {}
      if (typeof 头.title === 'string' && 头.title.trim()) o.标题 = 头.title.trim()
      if (typeof 头.preview === 'string' && 头.preview.trim()) o.预览 = 头.preview.trim().slice(0, 40)
      if (头.createdAt) o.建 = 时间戳(头.createdAt)
      if (头.updatedAt || 头.lastActivityAt) o.更 = 时间戳(头.updatedAt || 头.lastActivityAt)
      if (typeof 头.cwd === 'string') o.目录 = 头.cwd
      return Object.keys(o).length ? o : null
    }
    return null
  }

  /** 宿主自己那份标题缓存（手机端插件用它生成列表标题），读一段 JSON 很便宜 */
  const 读标题缓存 = () => {
    const 们 = [
      'C:/Users/' + (process.env.USERNAME || 'Administrator') + '/.dsh/mobile-remote/session-titles.json',
      (process.env.USERPROFILE || 'C:/Users/Administrator').replace(/\\/g, '/') + '/.dsh/mobile-remote/session-titles.json',
    ]
    for (const f of 们) {
      try {
        if (!existsSync(f)) continue
        const j = JSON.parse(readFileSync(f, 'utf8'))
        const 表 = new Map()
        for (const [id, v] of Object.entries(j?.entries || {})) {
          if (v && typeof v.title === 'string' && v.title.trim()) 表.set(id, v.title.trim())
        }
        if (表.size) return 表
      } catch (error) {}
    }
    return new Map()
  }

  let 缓存标题表 = { at: 0, 表: new Map() }
  const 标题缓存 = () => {
    if (Date.now() - 缓存标题表.at > 20000) 缓存标题表 = { at: Date.now(), 表: 读标题缓存() }
    return 缓存标题表.表
  }

  const 会话清单 = () => {
    const out = []
    const 表 = 标题缓存()
    try {
      const list = ctx.sessions?.list?.() || []
      for (const s of list) {
        const id = String(s.id || s.sessionId || '')
        if (!id) continue
        let 标题 = ''
        let 预览 = ''
        let 建 = ''
        let 更 = ''
        // 第一优先：内存里那间会话的事件流（session/title 事件就在里面）
        let 对象 = null
        try { 对象 = ctx.sessions?.get?.(id) } catch (error) {}
        if (对象) {
          try {
            const 事件们 = typeof 对象.snapshotEvents === 'function'
              ? (对象.snapshotEvents() || [])
              : (Array.isArray(对象.events) ? 对象.events : [])
            for (let i = 事件们.length - 1; i >= 0; i--) {
              const e = 事件们[i]
              if (e && e.type === 'session/title') {
                const t = e.data?.title
                if (typeof t === 'string' && t.trim()) { 标题 = t.trim(); break }
              }
            }
          } catch (error) {}
          const 头 = 对象.header
          if (头) {
            if (!标题 && typeof 头.title === 'string') 标题 = 头.title.trim()
            if (typeof 头.preview === 'string') 预览 = 头.preview.trim()
            建 = 时间戳(头.createdAt) || ''
            更 = 时间戳(头.updatedAt || 头.lastActivityAt) || ''
          }
        }
        // 第二优先：宿主标题接口 → 列表项自带的标题
        if (!标题) { try { 标题 = ctx.sessionTitle?.get?.(id) || '' } catch (error) {} }
        if (!标题) 标题 = s.title || s.name || ''
        // 第三优先：会话日志开头的会话头
        if (!标题) {
          const 头 = 读会话头(id)
          if (头) {
            标题 = 头.标题 || ''
            预览 = 预览 || 头.预览 || ''
            建 = 建 || 头.建 || ''
            更 = 更 || 头.更 || ''
          }
        }
        // 第四优先：手机端那份标题缓存；最后用首句话顶上
        if (!标题) 标题 = 表.get(id) || ''
        if (!预览) 预览 = s.preview || ''
        if (!标题 && 预览) 标题 = 预览
        out.push({
          id,
          标题: String(标题 || '').trim(),
          预览: String(预览 || '').trim(),
          建,
          更,
          更新于: s.updatedAt || s.mtime || null,
        })
      }
    } catch (error) {}
    return out
  }

  const 找agent = (id) => {
    const 原 = String(id == null ? '' : id).trim()
    if (!原) return undefined
    const 候选 = [原]
    if (原.startsWith('session-')) 候选.push(原.slice('session-'.length))
    else 候选.push('session-' + 原)
    for (const 一个 of 候选) {
      try {
        const a = ctx.agents.get(一个)
        if (a !== undefined) return a
      } catch (error) {}
    }
    return undefined
  }

  /** 没指定会话时：挑最近有动静、而且现在还开着的那个 agent —— 就是「当前在用的那间」 */
  const 自动挑agent = () => {
    let 最好 = null
    let 最好时间 = -1
    try {
      const 全部 = ctx.agents?.values?.() || []
      for (const a of 全部) {
        let 时间 = 0
        try {
          const h = a?.history?.()
          if (Array.isArray(h) && h.length) {
            const 末 = h[h.length - 1]
            时间 = Number(末?.time || 末?.ts || 末?.data?.time || 末?.seq || 0) || 0
            if (时间 < 1e12) 时间 = h.length
          }
        } catch (error) {}
        if (时间 > 最好时间) { 最好时间 = 时间; 最好 = a }
      }
    } catch (error) {}
    return 最好
  }

  const 定agent = (会话) => 找agent(会话) || 自动挑agent()

  const 新id = () => {
    try { return randomUUID() } catch (error) { return 'siri-' + Date.now() + '-' + Math.random().toString(36).slice(2) }
  }

  /**
   * 往会话里塞一句话 —— 跟你在界面上打字是一回事。
   * ⚠ 关键教训：`source.kind` 千万别写 'siri'。宿主只认 'user' 这种普通来话，
   *   自定义 kind 会被当成后台通知类消息静默吞掉（实测：src=siri 的 user/message
   *   进了会话，但伙伴一个字都没看到，只回了空文本）。保持 'user' 才和手打等价。
   */
  async function 送话(会话, 文本) {
    const agent = 定agent(会话)
    if (!agent) throw new Error('没找到可以说话的会话（先打开一间，或者在设置页选一间）')
    const 消息 = { id: 新id(), role: 'user', content: [{ type: 'text', text: String(文本) }], source: { kind: 'user' } }
    // ⚠ 必须 await：followup 返回 Promise，不接住的话 reject 会变成未处理异常，把整个宿主带下去
    if (typeof agent.followup === 'function') {
      await agent.followup(消息)
      送话日志.push({ 时间: new Date().toISOString().slice(11, 19), 方式: 'followup', 来源: 消息.source.kind, 文本: String(文本).slice(0, 30) })
      if (送话日志.length > 20) 送话日志.shift()
      return 'followup'
    }
    if (typeof agent.send === 'function') {
      await agent.send(消息)
      送话日志.push({ 时间: new Date().toISOString().slice(11, 19), 方式: 'send', 来源: 消息.source.kind, 文本: String(文本).slice(0, 30) })
      if (送话日志.length > 20) 送话日志.shift()
      return 'send'
    }
    throw new Error('这个版本的宿主没有可用的送话接口')
  }

  /**
   * 取我的回复。
   * ⚠ 关键教训：assistant/message 事件的正文在 `event.data.message.content`（数组里的 text 块），
   *   不是 `event.data.text` —— 之前读错字段，永远取不到，于是「联通但没反应」。
   */
  async function 取回复(会话, 基线seq) {
    const agent = 定agent(会话)
    if (!agent) return ''
    let 事件 = []
    try {
      const h = agent.history?.()
      if (Array.isArray(h)) 事件 = h
      else if (h && typeof h.then === 'function') 事件 = await h
    } catch (error) {}
    const 编号 = (e) => Number(e?.seq ?? e?.data?.seq ?? e?.turn ?? 0) || 0
    const 有字 = 事件.filter((e) => e && e.type === 'assistant/message' && !(e.data && e.data.interrupted))
    const 新 = 有字.filter((e) => 编号(e) > (Number(基线seq) || 0)).pop()
    return 新 ? 扒文字(新.data) : ''
  }

  /** 从 assistant/message 的 data 里扒出正文（兼容两种写法） */
  function 扒文字(d) {
    if (!d) return ''
    if (typeof d.text === 'string' && d.text.trim()) return d.text.trim()
    const m = d.message
    if (m && Array.isArray(m.content)) {
      return m.content
        .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('\n')
        .trim()
    }
    return ''
  }

  async function 当前最大seq(会话) {
    const agent = 定agent(会话)
    if (!agent) return 0
    try {
      const h = agent.history?.()
      const 事件 = Array.isArray(h) ? h : (h && typeof h.then === 'function' ? await h : [])
      const 编号 = (e) => Number(e?.seq ?? e?.data?.seq ?? e?.turn ?? 0) || 0
      const 有字 = 事件.filter((e) => e && e.type === 'assistant/message')
      return 有字.length ? 编号(有字[有字.length - 1]) : 0
    } catch (error) {
      return 0
    }
  }

  // ---------- HTTP 服务 ----------

  let 服务 = null

  function 停服务() {
    if (服务) {
      try { 服务.close() } catch (error) {}
      服务 = null
      状态.服务 = null
      状态.端口 = null
      记账('服务已停止')
    }
  }

  function 起服务() {
    停服务()
    const 配置 = 读配置()
    if (!配置.总开关) return
    const 端口 = Number(配置.端口) || 3919
    const 主机 = String(配置.监听 || '0.0.0.0')

    const 回 = (res, 码, 内容) => {
      const 是串 = typeof 内容 === 'string'
      res.writeHead(码, {
        'Content-Type': 是串 ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      })
      res.end(是串 ? 内容 : JSON.stringify(内容))
    }

    const 校验 = (u, req) => {
      const 口令 = String(配置.口令 || '')
      if (!口令) return true
      const 给的 = u.searchParams.get('t') || req.headers['x-siri-token'] || ''
      return String(给的) === 口令
    }

    服务 = http.createServer(async (req, res) => {
      const u = new URL(req.url || '/', 'http://x')
      const p = u.pathname.replace(/\/+$/, '') || '/'
      const 会话 = u.searchParams.get('session') || String(配置.会话 || '')

      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        })
        return res.end()
      }

      if (!校验(u, req)) return 回(res, 401, '口令不对')

      try {
        if (p === '/siri-bridge/say' || p === '/say') {
          let 文本 = String(u.searchParams.get('a') || u.searchParams.get('text') || '').trim()
          if (!文本 && req.method === 'POST') {
            let body = ''
            for await (const c of req) body += c
            try { 文本 = String(JSON.parse(body || '{}').text || '').trim() } catch (e) { 文本 = body.trim() }
          }
          if (!文本) return 回(res, 400, '空的')
          const 目标 = 会话 || String(配置.会话 || '')
          基线 = { seq: await 当前最大seq(目标), at: Date.now() }
          写JSON(基线文件, 基线)
          最近回复 = null
          await 送话(目标, 文本)
          记账('收到一句：' + 文本.slice(0, 40))
          return 回(res, 200, 'ok')
        }

        if (p === '/siri-bridge/wait' || p === '/wait') {
          const 目标 = 会话 || String(配置.会话 || '')
          const 最多 = Number(u.searchParams.get('timeout') || 配置.等待超时秒 * 1000)
          const 起点 = 基线?.seq ?? 0
          const 截止 = Date.now() + 最多
          while (Date.now() < 截止) {
            // 先看事件里实时抓到的，没有再翻历史兜底
            if (最近回复 && 最近回复.文本 && !最近回复.已取) {
              最近回复.已取 = true
              return 回(res, 200, 最近回复.文本)
            }
            const 文 = await 取回复(目标, 起点)
            if (文) return 回(res, 200, 文)
            await new Promise((r) => setTimeout(r, Number(配置.轮询毫秒) || 100))
          }
          return 回(res, 200, '还在想')
        }

        if (p === '/siri-bridge/reply' || p === '/reply') {
          if (最近回复 && 最近回复.文本) return 回(res, 200, 最近回复.文本)
          const 目标 = 会话 || String(配置.会话 || '')
          const 文 = await 取回复(目标, -1)
          return 回(res, 200, 文 || '（还没有回复）')
        }

        if (p === '/siri-bridge/ping' || p === '/ping') return 回(res, 200, 'pong')

        return 回(res, 404, '没有这个口子')
      } catch (error) {
        const 说 = String((error && error.message) || error)
        状态.最后错误 = 说
        记账('出错：' + 说)
        return 回(res, 500, 说)
      }
    })

    服务.on('error', (error) => {
      状态.最后错误 = String((error && error.message) || error)
      记账('端口起不来：' + 状态.最后错误)
      服务 = null
      状态.服务 = null
    })

    服务.listen(端口, 主机, () => {
      状态.服务 = 'running'
      状态.端口 = 端口
      状态.起于 = Date.now()
      状态.最后错误 = ''
      记账('服务已启动：http://' + 主机 + ':' + 端口)
    })
  }

  // ---------- 设置页用的路由 ----------

  const 回 = (res, o) => {
    try {
      res.setHeader?.('content-type', 'application/json; charset=utf-8')
      res.end?.(JSON.stringify(o))
    } catch (error) {}
  }

  const 读体 = async (req) => {
    let body = ''
    try {
      for await (const chunk of req) body += chunk
    } catch (error) {}
    try {
      return JSON.parse(body || '{}')
    } catch (error) {
      return {}
    }
  }

  const 路线 = (路径, handler) =>
    ctx.effect(() =>
      ctx.webServer.register({
        kind: 'exact',
        path: 路径,
        handler: async (req, res) => {
          try {
            await handler(req, res)
          } catch (error) {
            回(res, { ok: false, 说: String((error && error.message) || error) })
          }
        },
      }),
    )

  路线(`${路由前缀}/state`, async (req, res) => {
    await 读体(req)
    const 配置 = 读配置()
    const 网 = await 探查网络()
    return 回(res, {
      ok: true,
      版本: version,
      配置, 配置文件,
      配置问题: 检查配置(配置),
      服务: 状态.服务, 端口: 状态.端口, 起于: 状态.起于, 最后错误: 状态.最后错误,
      网络: 网,
      地址们: 给出地址(配置, 网),
      会话们: 会话清单(),
      日志: 日志.slice(-80),
      抓到的回复: 最近回复 ? String(最近回复.文本).slice(0, 200) : '',
      事件抽样: 原始事件缓存.slice(-6),
      送话流水: 送话日志.slice(-6),
      依赖: {
        手机插件: '不需要了，mobile-remote 完全不参与',
        宿主提供: ['agents（送话）', 'sessions（会话清单）', 'sessionTitle（标题）', 'webServer（设置页 + 接口）'],
        外部命令: ['route print（探网络）', 'arp -a（探邻居）', 'tailscale ip -4（探 Tailscale，没装就跳过）'],
      },
    })
  })

  // 「自动查找」按钮打的这个口：重新探一遍网络，把能用的地址和局域网里的设备列出来
  路线(`${路由前缀}/probe`, async (req, res) => {
    await 读体(req)
    const 配置 = 读配置()
    const 网 = await 探查网络()
    记账('探查网络：' + ((网.地址 || []).map((a) => a.地址 + '(' + a.类型 + ')').join(' , ') || '一个都没有'))
    return 回(res, {
      ok: true,
      网络: 网,
      地址们: 给出地址(配置, 网),
      说: (网.地址 || []).length
        ? '找到 ' + 网.地址.length + ' 个地址' + (网.Tailscale地址.length ? '，其中 Tailscale 地址 ' + 网.Tailscale地址[0] + ' 出门也能连' : '')
        : '没找到可用地址，看看网卡连上网没有',
    })
  })

  // 从电脑自己连一下本地端口，判断服务真起了没
  路线(`${路由前缀}/selftest`, async (req, res) => {
    await 读体(req)
    const 配置 = 读配置()
    const 端口 = Number(状态.端口 || 配置.端口) || 3919
    const 结果 = []
    // 先测回环，再测本机对外的每个地址——「回环通、局域网不通」通常就是防火墙拦了
    const 试的 = ['127.0.0.1', ...(本机地址们().map((x) => x.地址))]
    for (const 地址 of [...new Set(试的)]) {
      try {
        const r = await fetch(`http://${地址}:${端口}/ping`, { signal: AbortSignal.timeout(2500) })
        结果.push({ 地址, 通: r.ok, 内容: (await r.text()).slice(0, 60) })
      } catch (error) {
        结果.push({ 地址, 通: false, 内容: String((error && error.message) || error) })
      }
    }
    const 回环通 = (结果.find((x) => x.地址 === '127.0.0.1') || {}).通
    const 对外通 = 结果.filter((x) => x.地址 !== '127.0.0.1').some((x) => x.通)
    let 说 = ''
    if (!回环通) 说 = '服务没起来（总开关关着，或者端口被别的程序占了）'
    else if (结果.length > 1 && !对外通) 说 = '本机能连，但走网卡连不上——多半是 Windows 防火墙拦了，去放行 '+端口+' 端口的入站'
    else 说 = '都能连'
    return 回(res, { ok: true, 结果, 说 })
  })

  路线(`${路由前缀}/save`, async (req, res) => {
    const 体 = await 读体(req)
    const 新 = 写配置({ ...读配置(), ...(体.配置 || {}) })
    记账('配置已保存')
    起服务()
    // 保存完把地址一起回给界面，省得用户还要再点一次「自动查找」
    let 网 = null
    try { 网 = await 探查网络() } catch (error) {}
    return 回(res, { ok: true, 配置: 新, 配置问题: 检查配置(新), 地址们: 网 ? 给出地址(新, 网) : [] })
  })

  路线(`${路由前缀}/restart`, async (req, res) => {
    await 读体(req)
    起服务()
    return 回(res, { ok: true, 说: '已按新配置重启' })
  })

  路线(`${路由前缀}/test`, async (req, res) => {
    const 配置 = 读配置()
    const 会话 = String(配置.会话 || '')
    if (!会话) return 回(res, { ok: false, 说: '还没选会话' })
    try {
      基线 = { seq: await 当前最大seq(会话), at: Date.now() }
      写JSON(基线文件, 基线)
      const 方式 = await 送话(会话, '（Siri 桥测试）在吗')
      记账('测试送话成功：' + 方式)
      return 回(res, { ok: true, 说: '送进去了，看看会话里有没有（' + 方式 + '）' })
    } catch (error) {
      return 回(res, { ok: false, 说: String((error && error.message) || error) })
    }
  })

  // 插件起来时：按配置把服务拉起来
  记账('插件已加载，配置文件：' + 配置文件)
  if (!existsSync(配置文件)) 写配置(默认配置)
  起服务()

  // ⭐ 实时记下我的每一句回复（事件方式，比轮询会话历史可靠得多）
  ctx.effect(() => {
    const 摘 = ctx.on('session/event', (session, event) => {
      try {
        if (!event || event.type !== 'assistant/message') return
        const d = event.data || {}
        原始事件缓存.push({ 时间: new Date().toISOString().slice(11, 19), 字段: Object.keys(d).join(','), 文本: String(d.text || '').slice(0, 60) })
        if (原始事件缓存.length > 20) 原始事件缓存.shift()
        if (d.interrupted) return
        const 文 = 扒文字(d)
        if (!文) return
        最近回复 = { 文本: 文, 时间: Date.now(), 会话: String((session && session.id) || '') }
      } catch (error) {
        原始事件缓存.push({ 时间: new Date().toISOString().slice(11, 19), 错误: String((error && error.message) || error) })
      }
    })
    return () => { try { if (typeof 摘 === 'function') 摘() } catch (error) {} }
  }, 'siri-bridge: 盯伙伴说话')

  ctx.on?.('dispose', () => 停服务())
}

/** 包里那个版本号，设置页会显示 */
export const version = (() => {
  try {
    const p = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'))
    return String(p.version || '?')
  } catch (error) {
    return '?'
  }
})()
