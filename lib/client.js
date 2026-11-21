// DSH「Siri 语音桥」· 网页半边
//
// 在 **DSH 设置** 左侧栏加一项「Siri 语音桥」。
// 开关一开、会话一选、保存，手机上那条快捷指令就能用了。
//
// ⚠ 这里不碰会话、不发消息，只是往宿主那几条 /dsh-siri-bridge/* 路由上读写。

window.__ModuleLoader__.load({
  id: 'dsh-siri-bridge',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    const React = require('react')
    const inject = ['slots']

    const B = '/dsh-siri-bridge'
    const get = (p) => fetch(B + p, { cache: 'no-store' }).then((r) => r.json()).catch(() => null)
    const post = (p, body) =>
      fetch(B + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })
        .then((r) => r.json())
        .catch(() => null)

    const h = React.createElement

    const S = {
      wrap: { padding: '4px 2px 28px', fontSize: 13, lineHeight: 1.75 },
      h: { fontSize: 14, fontWeight: 600, margin: '18px 0 8px' },
      dim: { opacity: 0.62, fontSize: 12 },
      card: {
        border: '1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.1))',
        borderRadius: 10,
        padding: '12px 14px',
        marginBottom: 12,
      },
      row: { display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' },
      lab: { minWidth: 118, fontSize: 12.5, opacity: 0.85 },
      input: {
        border: '1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.15))',
        borderRadius: 6,
        padding: '5px 9px',
        background: 'transparent',
        color: 'inherit',
        fontSize: 12.5,
        width: 210,
        boxSizing: 'border-box',
      },
      hint: { opacity: 0.6, fontSize: 11.5, marginTop: 3 },
      // 手机里那一串动作：竖着一条一条往下排，跟手机上看到的一样，别横着滚
      步骤: {
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
        background: 'rgba(127,127,127,.08)',
        borderRadius: 6,
        padding: '10px 12px',
        margin: '6px 0 10px',
      },
      步骤块: {
        background: 'rgba(127,127,127,.10)',
        borderRadius: 10,
        padding: '7px 10px',
        fontSize: 12.5,
        lineHeight: 1.5,
      },
      步骤子: {
        marginLeft: 14,
        paddingLeft: 10,
        borderLeft: '2px solid rgba(127,127,127,.28)',
      },
      步骤行: { fontSize: 12.5, lineHeight: 1.55 },
      步骤键: { fontWeight: 600, marginRight: 4 },
      步骤值: {
        background: 'rgba(127,127,127,.16)',
        borderRadius: 4,
        padding: '0 5px',
      },
      步骤缩进: { marginLeft: 22 },
      地址行: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginTop: 6,
        padding: '6px 8px',
        background: 'var(--dsw-alias-bg-layer-2, rgba(0,0,0,.05))',
        borderRadius: 6,
      },
      地址串: {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: 11.5,
        flex: 1,
        wordBreak: 'break-all',
        opacity: 0.9,
      },
      btn: {
        border: '1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.15))',
        borderRadius: 6,
        padding: '5px 12px',
        background: 'transparent',
        color: 'inherit',
        fontSize: 12.5,
        cursor: 'pointer',
      },
      btnPrimary: {
        border: '1px solid transparent',
        borderRadius: 6,
        padding: '5px 14px',
        background: 'var(--dsw-alias-brand-primary, #4d6bfe)',
        color: '#fff',
        fontSize: 12.5,
        cursor: 'pointer',
      },
      monoBox: {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: 12,
        background: 'var(--dsw-alias-bg-layer-2, rgba(0,0,0,.05))',
        padding: '8px 10px',
        borderRadius: 6,
        wordBreak: 'break-all',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
      },
      mono: { fontFamily: 'ui-monospace, Consolas, monospace', flex: 1, wordBreak: 'break-all' },
      copy: { flex: '0 0 auto', cursor: 'pointer', fontSize: 12, opacity: 0.75, background: 'transparent', border: 0, color: 'inherit' },
      日志行: { fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 11.5, opacity: 0.82 },
      好: { color: '#1a9b57', fontSize: 12.5 },
      坏: { color: '#c0392b', fontSize: 12.5 },
      stepsText: { fontSize: 12.5, lineHeight: 1.9, opacity: 0.85 },
      步骤: { margin: '0 0 6px 18px', padding: 0 },
    }

    function 复制(文字, 说) {
      try {
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(文字).then(() => 说('复制好了'), () => 说('复制失败，手动选中'))
          return
        }
      } catch (error) {}
      说('浏览器不让复制，手动选中吧')
    }

    function 一条地址(标签, 值, 说) {
      return h('div', null,
        h('div', { style: { ...S.dim, marginBottom: 3 } }, 标签),
        h('div', { style: S.monoBox },
          h('span', { style: S.mono }, 值),
          h('button', { style: S.copy, onClick: () => 复制(值, 说) }, '复制'),
        ),
      )
    }

    function 块(文字, 键, 附) {
      return h('div', { style: S.步骤块 },
        h('div', null,
          h('span', null, 键 ? h('span', { style: S.步骤键 }, 键) : null),
          h('span', { style: S.步骤值 }, 文字),
        ),
        附 || null,
      )
    }

    // 填在 URL 那一栏的现成地址：能点一下直接复制，不用再往下翻
    function 现成地址(整条, 说) {
      return h('div', { style: S.地址行 },
        h('span', { style: S.地址串 }, 整条 ? 整条 : '（还没找到地址，先点上面的「自动查找」）'),
        h('button', { style: S.copy, onClick: () => 复制(整条, 说) }, '复制'),
      )
    }

    function 行(文字, 子) {
      return h('div', { style: S.步骤行 },
        h('span', null, 文字),
        Array.isArray(子) ? h('div', { style: S.步骤子 }, 子) : null,
      )
    }

    function 流程(项) {
      return h('div', { style: S.步骤 }, 项)
    }

    function Section() {
      const [态, 设态] = React.useState(null)
      const [配置, 设配置] = React.useState(null)
      const [脏, 设脏] = React.useState(false)
      const [忙, 设忙] = React.useState(false)
      const [说, 设说] = React.useState('')
      const [探, 设探] = React.useState(null)
      const [自检, 设自检] = React.useState(null)
      // 'local' = 走局域网（同一个 WiFi），'remote' = 走 Tailscale（出门也能连）
      const [走法, 设走法] = React.useState(() => {
        try { return window.localStorage.getItem('dsh-siri-bridge-走法') === 'remote' ? 'remote' : 'local' } catch (error) { return 'local' }
      })
      React.useEffect(() => {
        try { window.localStorage.setItem('dsh-siri-bridge-走法', 走法) } catch (error) {}
      }, [走法])

      const 拉 = React.useCallback(() => {
        get('/state').then((d) => {
          if (!d || !d.ok) {
            设说((d && d.说) || '读不到状态')
            return
          }
          设态(d)
          设配置((现在) => 现在 || d.配置)
          设脏(false)
        })
      }, [])

      React.useEffect(() => { 拉() }, [拉])
      React.useEffect(() => {
        const t = setInterval(() => { if (!脏Ref.current) 拉() }, 5000)
        return () => clearInterval(t)
      }, [拉])

      const 脏Ref = React.useRef(false)
      React.useEffect(() => { 脏Ref.current = 脏 }, [脏])

      const 改 = (k, v) => {
        设配置((c) => ({ ...(c || {}), [k]: v }))
        设脏(true)
      }

      const 存 = async () => {
        设忙(true)
        const r = await post('/save', { 配置 })
        设忙(false)
        if (r && r.ok) {
          设配置(r.配置)
          设脏(false)
          设说('保存好了，服务已按新配置重启')
          拉()
        } else {
          设说((r && r.说) || '保存失败')
        }
      }

      const 自动查找 = async () => {
        设忙(true)
        const r = await post('/probe', {})
        设忙(false)
        if (r && r.ok) {
          设探(r)
          设说(r.说 || '查完了')
          拉()
          // 找到地址后，把「发送」那条直接复制到剪贴板，省得手抄
          一条地址直接复制(r.地址们)
        } else {
          设说('查找失败')
        }
      }

      // 找到地址后自动把当前这条线（局域网 / Tailscale）的【发送】URL 复制到剪贴板
      const 一条地址直接复制 = async (们) => {
        try {
          const 全 = 们 || []
          const 远程 = 全.filter((a) => /Tailscale/.test(a.说明 || ''))
          const 近程 = 全.filter((a) => !/Tailscale/.test(a.说明 || ''))
          const 这条 = (走法 === 'remote' && 远程.length ? 远程 : 近程)[0]
          if (!这条 || !这条.发) return
          await navigator.clipboard.writeText(这条.发)
          设说('地址找到了，已经把「' + (走法 === 'remote' && 远程.length ? 'Tailscale' : '局域网') + '」那条【发送】复制到剪贴板')
        } catch (error) {}
      }

      const 检查服务 = async () => {
        设忙(true)
        const r = await post('/selftest', {})
        设忙(false)
        设自检(r && r.结果 ? r.结果 : null)
        设说((r && r.说) || (r ? '从这台电脑连了一下服务' : '没反应'))
      }

      const 测试送话 = async () => {
        设忙(true)
        const r = await post('/test', { 会话: 配置?.会话 })
        设忙(false)
        设说((r && r.说) || '没反应')
      }

      if (!态 || !配置) {
        return h('div', { style: S.wrap }, h('div', { style: S.h }, 'Siri 语音桥'), h('div', { style: S.dim }, 说 || '读取中…'))
      }

      const 开着 = 态.服务 === 'running'
      const 地址们 = (探 && 探.地址们) || 态.地址们 || []
      const 远程地址们 = 地址们.filter((a) => /Tailscale/.test(a.说明 || ''))
      const 近程地址们 = 地址们.filter((a) => !/Tailscale/.test(a.说明 || ''))
      const 有远程 = 远程地址们.length > 0
      // 走法选的是远程、但远程地址没有（没装 / 没登录 Tailscale）→ 退回局域网，并提示一句
      const 实际走法 = 走法 === 'remote' && 有远程 ? 'remote' : 'local'
      const 候选 = 实际走法 === 'remote' ? 远程地址们 : 近程地址们
      const 主地址 = 候选[0] || 地址们[0]
      const 主机 = 主地址 ? 主地址.地址.replace(/^http:\/\//, '').replace(/:\d+$/, '') : '（这里应该有个地址）'
      const 端口 = 配置.端口
      const 会话们 = 态.会话们 || []
      // 自己起的名字优先于内核给的标题（内核那边常常是空的）
      const 别名表 = (配置 && 配置.别名) || {}
      const 叫法 = (s) => {
        const 自己起的 = 别名表[s.id]
        if (自己起的) return 自己起的
        return s.标题 || '（无标题）'
      }
      const 选中 = 会话们.find((s) => s.id === String(配置.会话 || ''))
      const 问题 = 态.配置问题 || []
      const 网 = (探 && 探.网络) || 态.网络 || {}
      const 本机 = (网.地址 || []).map((a) => a.地址 + '（' + a.类型 + '）')
      const 对话 = (网.邻居 || []).filter((n) => /^192\.168\.|^10\.|^172\./.test(n.地址)).slice(0, 12)

      const 行 = (标签, 控件, 提示) =>
        h('div', { style: S.row },
          h('span', { style: S.lab }, 标签),
          控件,
          提示 ? h('span', { style: S.hint, key: 'hint' }, 提示) : null)

      return h('div', { style: S.wrap },

        // ===== 顶部简介 =====
        h('div', { style: S.card },
          h('div', { style: S.h, marginTop: 0 }, '这是什么'),
          h('div', { style: S.dim }, '让 iPhone 的「快捷指令 + Siri」直接跟你在这台电脑上的伙伴说话：说一句进去，回复回到手机上。',
          ),
          h('div', { style: S.hint }, '只依赖 DSH 自带的东西，不用装别的插件；QQ 桥、手机端插件都不参与。'),
        ),

        // ===== 状态 =====
        h('div', { style: S.card },
          h('div', { style: S.row },
            h('span', { style: S.lab }, '服务状态'),
            h('span', { style: 开着 ? S.好 : S.坏 }, 开着 ? '✓ 在跑' : '✗ 没在跑'),
            h('span', { style: S.dim }, 开着 ? '端口 ' + 态.端口 : (态.最后错误 ? '错误：' + 态.最后错误 : '总开关关着？')),
            h('span', { style: { ...S.dim, marginLeft: 'auto' } }, '版本 ' + String(态.版本 || '')),
          ),
          h('div', { style: S.dim }, '这台电脑上能看到自己的地址：' + (本机.join('  /  ') || '（一个都没找到，网卡没连网？）')),
          问题.length
            ? h('div', { style: { ...S.坏, marginTop: 6 } }, '要处理的：' + 问题.join('；'))
            : h('div', { style: { ...S.好, marginTop: 6 } }, '✓ 配置没问题'),
        ),

        // ===== 第一步：开关 =====
        h('div', { style: S.h }, '① 打开开关'),
        h('div', { style: S.card },
          h('div', { style: S.row },
            h('button', {
              style: 配置.总开关 ? S.btnPrimary : S.btn,
              onClick: () => 改('总开关', !配置.总开关),
            }, 配置.总开关 ? '● 开着（点一下关掉）' : '○ 关着（点一下打开）'),
            h('span', { style: S.dim }, '关着的时候一个端口都不开，别人谁也连不上'),
          ),
          行('端口', h('input', { type: 'number', style: S.input, value: 端口, onChange: (e) => 改('端口', Number(e.target.value) || 0) }), '默认 3919，改完要点保存'),
          行('等待超时', h('input', { type: 'number', style: S.input, value: 配置.等待超时秒, onChange: (e) => 改('等待超时秒', Number(e.target.value) || 120) }), '秒。手机等这么久还没回复就会读到「还在想」'),
          行('口令', h('input', { style: S.input, value: 配置.口令 || '', placeholder: '留空 = 不校验', onChange: (e) => 改('口令', e.target.value) }), '留空最省事；填了的话手机链接后面要加 &t=口令'),
        ),

        // ===== 第二步：会话 =====
        h('div', { style: S.h }, '② 选送进哪一间会话'),
        h('div', { style: S.card },
          h('div', { style: S.row },
            h('select', {
              style: { ...S.input, width: 340 },
              value: String(配置.会话 || ''),
              onChange: (e) => 改('会话', e.target.value),
            }, h('option', { value: '' }, '（还没选，选一间你说的话落进去的地方）'),
              ...会话们.map((s) => h('option', { key: s.id, value: s.id },
                叫法(s)
                + (s.更 ? ' · ' + s.更 : '')
                + ' · ' + String(s.id).slice(-8),
              ))),
            h('button', { style: S.btn, onClick: 测试送话, disabled: 忙 }, '发一句「在吗」试试'),
          ),
          h('div', { style: 选中 ? S.好 : S.坏 }, 选中 ? '✓ 现在是：' + 叫法(选中) : '⚠ 还没选会话，手机发过来的话进不去'),
          h('div', { style: S.hint }, '这台电脑上「微信/QQ 私聊」都落到同一间会话；选那一间最顺。'),
          // 内核没给出标题时，让你自己写一个，只记在本机配置里
          h('div', { style: S.row },
            h('input', {
              style: { ...S.input, width: 340 },
              placeholder: '给这间会话起个名（随便写，只给你自己认，不影响它原来的标题）',
              value: String(配置?.别名?.[配置.会话 || ''] || ''),
              onChange: (e) => {
                const 表 = { ...(配置?.别名 || {}) }
                if (e.target.value.trim()) 表[String(配置.会话 || '')] = e.target.value.trim()
                else delete 表[String(配置.会话 || '')]
                改('别名', 表)
              },
            }),
          ),
          h('div', { style: S.hint }, '下拉里显示「无标题」时，用这条自己起个名存着，下次还是它。'),
        ),

        // ===== 第三步：地址 =====
        h('div', { style: S.h }, '③ 找地址 + 选走哪条线'),
        h('div', { style: S.card },
          h('div', { style: S.row, marginBottom: 8 },
            h('span', { style: S.lab }, '走哪条线'),
            h('button', {
              style: 实际走法 === 'local' ? S.btnPrimary : S.btn,
              onClick: () => 设走法('local'),
            }, '局域网（同一个 WiFi）'),
            h('button', {
              style: 实际走法 === 'remote' ? S.btnPrimary : S.btn,
              onClick: () => 设走法('remote'),
              disabled: !有远程,
            }, 有远程 ? 'Tailscale（出门也能连）' : 'Tailscale（还没有地址）'),
            h('span', { style: S.dim }, '选哪条，下面【发送】【接收】两条 URL 就用哪条'),
          ),
          h('div', { style: S.row },
            h('button', { style: S.btnPrimary, onClick: 自动查找, disabled: 忙 }, '自动查找'),
            h('button', { style: S.btn, onClick: 检查服务, disabled: 忙 }, '检查服务能不能连'),
            h('span', { style: S.dim }, '找的是网卡 + 路由表 + 局域网设备表，不动别的'),
          ),
          走法 === 'remote' && !有远程
            ? h('div', { style: S.坏 }, '⚠ 选了走 Tailscale，但这台电脑现在没有 Tailscale 地址（没装 / 没登录 / 没开），先按局域网给你。')
            : null,
          自检 ? h('div', { style: 自检.every((x) => x.通) ? S.好 : S.坏 },
            '电脑自己连：' + 自检.map((x) => x.地址 + ' → ' + (x.通 ? '通' : '不通')).join('；')) : null,
          地址们.length
            ? 地址们.map((a, i) => {
                const 选中了 = 主地址 && a.地址 === 主地址.地址
                return h('div', { key: i, style: { ...S.row, marginBottom: 4 } },
                  h('span', { style: 选中了 ? S.mono : S.dim, key: 'a' }, a.地址),
                  h('span', { style: S.dim, key: 'b' }, a.说明),
                  h('button', { key: 'u', style: S.btn, onClick: () => 设走法(/Tailscale/.test(a.说明 || '') ? 'remote' : 'local') }, '用这条'),
                  (选中了 ? h('span', { style: S.好, key: 'c' }, '← 现在用这条') : null))
              })
            : h('div', { style: S.坏 }, '还没找到地址，点上面「自动查找」'),
          h('div', { style: S.hint }, '「WiFi（同一局域网）」= 手机连同一个路由器时用；「Tailscale」= 出门在外面用，不用在同一个 WiFi。'),
          h('div', { style: S.hint }, '找找看局域网里有哪些设备（认得出手机会排在前面）：' + (对话.length ? 对话.map((n) => n.地址).join(' , ') : '先点自动查找')),
        ),

        // ===== 第四步：填快捷指令 =====
        h('div', { style: S.h }, '④ 手机快捷指令这么填'),
        h('div', { style: S.card },
          h('div', { style: S.dim }, '两条搭配着用：稳定版是主力，推荐加到桌面、从图标点开；极速版专门留给「嘿 Siri」呼出。'),
          h('div', { style: S.dim }, '极速版没有菜单挡着，说完一轮得赶紧接下一句，想太久 Siri 就把话接走了；稳定版每轮先弹一下菜单，等于按了个「我还在」，能连着聊，还能选打字。'),
          h('div', { style: 主地址 ? S.hint : S.坏 }, 主地址
            ? '下面示例里的地址就是你现在「' + (实际走法 === 'remote' ? 'Tailscale' : '局域网') + '」这条线的真地址，直接点「复制」贴进手机。'
            : '还没找到这台电脑的地址，下面示例只能是占位；先回到上面「③ 找地址」点一下「自动查找」。'),

          h('div', { style: S.h }, '稳定版 · 推荐放桌面'),
          h('div', { style: S.hint, marginTop: 0 }, '名字随便起，反正不从 Siri 叫它，比如「小橙」「和小橙聊天」。'),
          流程([
            块('10 次', '重复'),
            块('从包含「预热请求…」的菜单中选取', ''),
            h('div', { style: S.步骤子 },
              h('div', { style: S.步骤行 }, '文本'),
              h('div', { style: S.步骤行 }, '语音'),
              h('div', { style: S.步骤键, marginTop: 4 }, '文本'),
              h('div', { style: S.步骤行 }, '└ 通过「想和小橙说什么?」请求 文本'),
              h('div', { style: S.步骤键, marginTop: 4 }, '语音'),
              h('div', { style: S.步骤行 }, '└ 听写文本'),
            ),
            块('结束菜单', ''),
            块('菜单结果 是 听写的文本', '如果'),
            块('获取', '', 现成地址(主地址 ? 主地址.发 + '[听写的文本]' : '', 设说)),
            块('', '否则'),
            块('获取', '', 现成地址(主地址 ? 主地址.发 + '[提供的输入]' : '', 设说)),
            h('div', { style: S.步骤行 }, h('span', { style: S.步骤键 }, '结束如果')),
            块('获取', '', 现成地址(主地址 ? 主地址.收 : '', 设说)),
            块('URL 的内容', '显示通知'),
            h('div', { style: S.步骤行 }, h('span', { style: S.步骤键 }, '结束重复')),
          ]),
          h('div', { style: S.hint }, '重点：'),
          h('div', { style: S.hint }, '· 菜单里那两行「文本」「语音」是**文本块**，不是动作的结果——把「文本」两个字单独拖进菜单里当一项，选中它时走「文本」这一支。'),
          h('div', { style: S.hint }, '· 「文本」下面那行是「请求 文本」动作，弹输入框让你打字；「语音」下面是「听写文本」。两行各管一支。'),
          h('div', { style: S.hint }, '· 每个「获取」都展开看看：方法写 **GET**，头部不填、请求体不填；URL 那一栏贴上面的地址，后面的方括号是在变量列表里插进去的，别手打。'),
          h('div', { style: S.hint }, '· 长按这条指令 → 分享 → 「添加到主屏幕」，以后从桌面图标点开用。从图标启动时 Siri 不会抢麦克风，「文本」那一支就是老老实实打字。'),
          h('div', { style: S.hint }, '· 不想聊了，直接结束快捷指令就行。'),
          h('div', { style: S.hint }, '· 判断条件保持原样能用，原因写在下面「小毛病」那条。'),

          h('div', { style: S.h }, '极速版 · 留给 Siri 呼出'),
          h('div', { style: S.hint, marginTop: 0 }, '这条的名字就是「叫它」的咒语，必须起成「使用deepseek」这种好念的——名字见下面「给它起个好叫的名字」。'),
          流程([
            块('10 次', '重复'),
            块('听写文本', ''),
            块('获取', '', 现成地址(主地址 ? 主地址.发 + '[听写的文本]' : '', 设说)),
            块('获取', '', 现成地址(主地址 ? 主地址.收 : '', 设说)),
            块('URL 的内容', '显示通知'),
            h('div', { style: S.步骤行 }, h('span', { style: S.步骤键 }, '结束重复')),
          ]),
          h('div', { style: S.hint }, '适合：喊一句「嘿 Siri，使用deepseek」就用，不用掏手机点图标，纯语音。'),
          h('div', { style: S.hint }, '代价：一轮说完，Siri 会等你几秒；要是没马上接下一句，它就把你接下来的话当成在跟她说。所以——想下一句别想太久，说完就接。'),

          h('div', { style: S.h } , '小毛病（稳定版照抄就行，不用改）'),
          h('div', { style: S.hint }, '那句「如果 菜单结果 是 听写的文本」，其实拿「菜单选的词」去比「听写出来的字」，基本永远不相等，所以实际总走「否则」那一支。'),
          h('div', { style: S.hint }, '现在能跑通是因为两边都落到同一个发送口；真想按来源分清，就把条件改成「如果 菜单结果 是 文本」，再在每一支里把内容存进一个变量，后面统一拼进 say?a=。'),

          h('div', { style: S.h }, '放到桌面上用（重要）'),
          h('div', { style: S.stepsText, marginTop: 6 },
            h('div', null, '① 快捷指令 App 里，长按这条指令 → 分享 → 「添加到主屏幕」'),
            h('div', null, '② 以后从桌面图标点它启动，不要从 Siri 唤起'),
            h('div', null, '③ 从桌面启动时，Siri 不会抢麦克风，选「文本」那一支就能正常打字输入了'),
          ),
          h('div', { style: S.hint }, '从 Siri 直接唤起时，iOS 27 的 Siri 会自己判断要不要接管输入，经常把「请求文本」变成语音。绕开它的办法就是走桌面图标。'),

          h('div', { style: S.h }, '给它起个好叫的名字（这条说的是极速版）'),
          h('div', { style: S.stepsText, marginTop: 6 },
            h('div', null, '① 在快捷指令里点极速版这条右上角「⋯」→ 最上面那行名字，改成顺口的，比如「使用deepseek」'),
            h('div', null, '② 名字别太长、别有生僻字，Siri 咬字才准；改完念一遍「嘿 Siri，使用deepseek」试试'),
            h('div', null, '③ Siri 只认名字调指令，名字对不上它就听不懂你在使唤谁；叫不动时先改成简短英文或拼音再试'),
          ),
          h('div', { style: S.hint }, '两条指令别起同一个名字，Siri 会分不清该唤醒哪条；稳定版建议叫「小橙」之类，桌面图标也跟着是这个名字。'),

          h('div', { style: S.dim }, '下面两条用的是「' + (实际走法 === 'remote' ? 'Tailscale' : '局域网') + '」这条线，跟上面示例里是同一套：'),
          一条地址('【发送】说一句话进来（后面接听写的文本）', 主地址 ? 主地址.发 : '（先点自动查找）', 设说),
          一条地址('【接收】取下我的回复（什么都不用接）', 主地址 ? 主地址.收 : '（先点自动查找）', 设说),
          h('div', { style: S.hint }, '两条都用 GET；发送那条后面直接接听写文本，不要再加引号。'),
          h('div', { style: S.hint }, '想自己先验一下通不通：把' + (主地址 ? 主地址.测试 : '/ping 那个地址') + '丢到手机浏览器里，能看见 pong 就通了。'),
          h('div', { style: S.hint }, '「显示通知」别用「显示提醒」：提醒会卡在那儿挡住后面的操作，通知弹一下就过去了。'),
          h('div', { style: S.hint }, '换线了就把手机里那两条 URL 重新粘一遍——两边地址不一样，捷径不会自己跟着换。'),
        ),

        // ===== 出门能不能用 =====
        h('div', { style: S.h }, '⑤ 出门还能不能用'),
        h('div', { style: S.card },
          h('div', { style: 有远程 ? S.好 : S.dim },
            有远程
              ? '✓ 这台电脑有远程地址，手机用流量 / 别的 WiFi 也能连'
              : '现在只有局域网地址：手机得连同一个路由器（跟电脑同一个 WiFi）才连得上'),
          h('div', { style: S.步骤 },
            h('div', null, '想在外面也能用，电脑和手机都装 Tailscale，登录同一个账号就行。'),
            h('div', null, '装完回这里点「自动查找」，会多出一条 100. 开头的地址，把它换进快捷指令即可。'),
            h('div', null, '那个 100. 开头的地址是固定的，换网络、重启都不会变，只有把设备从账号里删掉再加才会变。'),
          ),
          h('div', { style: S.hint }, '没装也没关系，在家/宿舍同一个 WiFi 下照样用。'),
        ),

        // ===== 连不上怎么办 =====
        h('div', { style: S.h }, '连不上怎么办'),
        h('div', { style: S.card },
          h('div', { style: S.步骤 },
            h('div', null, '① 先点上面「检查服务能不能连」：本机通、地址不通，基本就是 Windows 防火墙拦了。'),
            h('div', null, '② 手机和电脑要连同一个 WiFi（用 100. 地址的话不用管这条）。'),
            h('div', null, '③ 端口别乱改，改了手机上的链接也要跟着改。'),
            h('div', null, '④ 这台电脑关机 / 休眠，手机上就连不上了——它是我住的地方。'),
          ),
        ),

        // ===== 保存 =====
        h('div', { style: S.row },
          h('button', { style: S.btnPrimary, onClick: 存, disabled: 忙 }, '保存设置'),
          h('button', { style: S.btn, onClick: 拉 }, '刷新'),
          h('span', { style: 脏 ? S.坏 : S.好 }, 脏 ? '⚠ 有改动还没保存' : '已同步 ✓'),
          说 ? h('span', { style: S.dim }, 说) : null,
        ),

        // ===== 日志 =====
        h('div', { style: S.h }, '最近日志'),
        h('div', { style: S.card }, (态.日志 || []).slice().reverse().map((x, i) =>
          h('div', { key: i, style: S.日志行 }, String(x.时间 || '').slice(11, 19) + '  ' + x.说))),
      )
    }

    function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) return
      slots.inject('settings.section', () =>
        slots.register(
          { name: 'settings.section', id: 'siri-bridge', order: 55, label: () => 'Siri 语音桥' },
          Section,
        ),
      )
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
