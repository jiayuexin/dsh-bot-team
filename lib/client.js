window.__ModuleLoader__.load({
  id: '@lingyun_jaya/dsh-bot-team',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useMemo, useCallback, useSyncExternalStore } = React

    const NS = 'bot-team'
    const PANEL_ID = 'bots'
    const CHAT_SLOT = 'bots.chat.conversation'
    const BASE = '/plugins/dsh-bot-team'
    const SHAPES = ['circle', 'square', 'hexagon', 'diamond']
    const COLORS = ['#3b6ef5', '#22c58b', '#f5a524', '#e5484d', '#8e4ec6', '#0091ff', '#f76b15', '#12a594']

    const zh = {
      panel: 'Bot', title: 'Bot 团队', newBot: '新建 Bot', newGroup: '新建群聊', pinned: '置顶', others: '成员', groups: '群聊',
      hidden: '已隐藏的 Bot（{n}）', showHidden: '显示已隐藏', hideHidden: '收起', emptyTitle: '还没有 Bot', emptyBody: '新建一个 Bot 同事：给它名字、岗位和职责，它会先做自我介绍。',
      pick: '从左侧选择一个 Bot 或群聊', loading: '加载中…', retry: '重试', details: '详情', close: '关闭',
      missingSession: '这个 Bot 的会话已不存在（可能在侧栏被删除了）。', recreate: '重建会话',
      tabProfile: '档案', tabMemory: '记忆', tabSkills: '技能', tabRoutines: 'Routines', tabSettings: '设置',
      name: '名字', jobTitle: '岗位', description: '职责', shape: '头像形状', color: '颜色', section: '分组', sectionHint: '留空则不分组',
      save: '保存', saved: '已保存', cancel: '取消', create: '创建', creating: '创建中…', delete: '删除', confirmDelete: '确认删除？',
      pin: '置顶', unpin: '取消置顶', hide: '隐藏', unhide: '取消隐藏',
      memoryHint: 'Bot 用 bot_remember 写入的长期记忆，可以直接编辑或清空。', clear: '清空',
      shared: '共享技能', private: '私有技能', toShared: '设为共享', toPrivate: '设为私有', noSkills: '暂无',
      scheduled: '定时', events: '事件', testRun: '立即测试', edit: '编辑', pause: '暂停', resume: '恢复',
      noRoutines: '暂无。让 Bot 用 schedule_create / bot_trigger_create 创建。', nextRun: '下次：{t}', lastRun: '上次：{t}', lastError: '错误：{e}',
      autoReview: '自动审查', autoReviewHint: '由审查模型在每次工具调用前判断风险，危险操作会请求你批准。', autoReviewUnavailable: '需要先在「插件」页启用 DeepSeek Harness 自带的「自动审查」。',
      deleteBot: '删除 Bot', deleteBotHint: '会删除档案、记忆和它的 Routines；共享工作区里的文件和会话记录会保留。',
      members: '成员', deleteGroup: '删除群聊', groupHint: '选择 2 到 6 个 Bot',
      apps: '已连接应用', noApps: '还没有连接 MCP 应用。', howToAdd: '如何添加',
      howToAddBody: '在 DSH profile 的 cordis.patch.yml 中为每个服务器插入一行 @deepseek-ai/dsh-mcp-client（填写 serverName 和传输方式），保存后重启 DeepSeek Harness。所有 Bot 共用这些应用。',
      everyone: '所有成员', section_bots: 'Bot 同事', tested: '已投递', error: '出错了：{e}',
      code_name_taken: '已经有同名的 Bot 了，换一个名字。',
      code_invalid_name: '名字需为 1 到 32 个字符，不能包含空格、@、方括号或圆括号，也不能叫 everyone。',
      code_bot_limit_reached: 'Bot 数量已达上限（50 个）。',
      code_invalid_members: '群聊需要 2 到 6 个 Bot。',
      code_memory_too_large: '记忆超过 8 KB 上限，请先精简。',
      code_skill_exists: '目标位置已有同名技能。',
      code_session_unavailable: '这个 Bot 的会话暂时无法打开。',
      code_auto_review_unavailable: '需要先在「插件」页启用 DeepSeek Harness 自带的「自动审查」。',
      code_untrusted_request: '请求被拒绝：不是来自 DeepSeek Harness 页面。',
    }
    const en = {
      panel: 'Bots', title: 'Bot Team', newBot: 'New Bot', newGroup: 'New group', pinned: 'Pinned', others: 'Bots', groups: 'Groups',
      hidden: 'Hidden Bots ({n})', showHidden: 'Show hidden', hideHidden: 'Collapse', emptyTitle: 'No Bots yet', emptyBody: 'Create a Bot teammate with a name, a job and responsibilities; it introduces itself first.',
      pick: 'Select a Bot or group on the left', loading: 'Loading…', retry: 'Retry', details: 'Details', close: 'Close',
      missingSession: "This Bot's conversation no longer exists (it may have been deleted from the sidebar).", recreate: 'Recreate conversation',
      tabProfile: 'Profile', tabMemory: 'Memory', tabSkills: 'Skills', tabRoutines: 'Routines', tabSettings: 'Settings',
      name: 'Name', jobTitle: 'Title', description: 'Responsibilities', shape: 'Shape', color: 'Color', section: 'Section', sectionHint: 'Leave empty for none',
      save: 'Save', saved: 'Saved', cancel: 'Cancel', create: 'Create', creating: 'Creating…', delete: 'Delete', confirmDelete: 'Delete?',
      pin: 'Pin', unpin: 'Unpin', hide: 'Hide', unhide: 'Unhide',
      memoryHint: 'Long-term memory written by bot_remember; edit or clear it here.', clear: 'Clear',
      shared: 'Shared skills', private: 'Private skills', toShared: 'Make shared', toPrivate: 'Make private', noSkills: 'None',
      scheduled: 'Scheduled', events: 'Events', testRun: 'Run now', edit: 'Edit', pause: 'Pause', resume: 'Resume',
      noRoutines: 'None. Ask the Bot to create one with schedule_create or bot_trigger_create.', nextRun: 'Next: {t}', lastRun: 'Last: {t}', lastError: 'Error: {e}',
      autoReview: 'Auto review', autoReviewHint: 'A reviewer model judges each tool call; risky actions ask for your approval.', autoReviewUnavailable: 'Enable the shipped "Auto review" plugin on the Plugins page first.',
      deleteBot: 'Delete Bot', deleteBotHint: 'Removes the profile, memory and its routines; shared workspace files and the conversation record stay.',
      members: 'Members', deleteGroup: 'Delete group', groupHint: 'Pick 2 to 6 Bots',
      apps: 'Connected apps', noApps: 'No MCP apps connected yet.', howToAdd: 'How to add',
      howToAddBody: "Insert one @deepseek-ai/dsh-mcp-client row per server (serverName and transport) into the DSH profile's cordis.patch.yml, then restart DeepSeek Harness. Every Bot shares these apps.",
      everyone: 'Everyone', section_bots: 'Bot teammates', tested: 'Delivered', error: 'Error: {e}',
      code_name_taken: 'A Bot with this name already exists.',
      code_invalid_name: 'Names are 1-32 characters without spaces, @, brackets or parentheses, and cannot be "everyone".',
      code_bot_limit_reached: 'The Bot limit (50) is reached.',
      code_invalid_members: 'A group needs 2 to 6 Bots.',
      code_memory_too_large: 'Memory exceeds the 8 KB limit; trim it first.',
      code_skill_exists: 'A skill with this name already exists at the destination.',
      code_session_unavailable: "This Bot's conversation cannot be opened right now.",
      code_auto_review_unavailable: 'Enable the shipped "Auto review" plugin on the Plugins page first.',
      code_untrusted_request: 'Request refused: it did not come from the DeepSeek Harness page.',
    }

    // --- Host API -------------------------------------------------------

    async function api(path, body) {
      const init = body === undefined
        ? { headers: { accept: 'application/json', 'x-dsh-bot-team': '1' }, credentials: 'same-origin' }
        : { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json', 'x-dsh-bot-team': '1' }, credentials: 'same-origin', body: JSON.stringify(body) }
      const response = await fetch(`${BASE}${path}`, init)
      let json = {}
      try { json = await response.json() } catch { json = {} }
      if (!response.ok) throw Object.assign(new Error(json.message ?? `HTTP ${response.status}`), { code: json.code })
      return json
    }

    /** One shared snapshot of `/state`, refreshed after every mutation and while the page is open. */
    function createStore() {
      let snapshot = { status: 'loading', data: undefined, error: undefined }
      const listeners = new Set()
      let inflight
      const publish = (next) => { snapshot = next; for (const listener of listeners) listener() }
      return {
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
        getSnapshot: () => snapshot,
        refresh() {
          if (inflight !== undefined) return inflight
          inflight = api('/state').then(
            (data) => { publish({ status: 'ready', data, error: undefined }) },
            (error) => { publish({ status: snapshot.data === undefined ? 'error' : 'ready', data: snapshot.data, error }) },
          ).finally(() => { inflight = undefined })
          return inflight
        },
      }
    }

    function format(template, values) {
      return template.replace(/\{(\w+)\}/g, (_m, key) => String(values?.[key] ?? ''))
    }

    function timeLabel(value) {
      if (value === undefined || value === null) return ''
      const date = new Date(value)
      return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString()
    }

    // --- Styles ---------------------------------------------------------

    const CSS = `
.dbt-page{position:relative;display:flex;height:100%;min-height:0;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font-size:13px}
.dbt-roster,.dbt-main,.dbt-details{padding-top:var(--dsh-frame-top-clearance,0px)}
.dbt-drag{position:absolute;top:0;left:0;right:0;height:var(--dsh-frame-top-clearance,0px)}
.dbt-roster{width:240px;flex:none;display:flex;flex-direction:column;border-right:1px solid var(--dsw-alias-border-l1);min-height:0}
.dbt-roster-head{display:flex;align-items:center;gap:6px;padding:14px 12px 8px}
.dbt-roster-title{font-weight:600;font-size:14px;flex:1}
.dbt-roster-list{flex:1;overflow:auto;padding:4px 6px 8px}
.dbt-label{padding:10px 8px 4px;color:var(--dsw-alias-label-tertiary);font-size:12px}
.dbt-row{display:flex;align-items:center;gap:10px;width:100%;padding:7px 8px;border:0;border-radius:8px;background:transparent;color:inherit;text-align:left;cursor:pointer}
.dbt-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dbt-row[aria-current="true"]{background:var(--dsw-alias-interactive-bg-active)}
.dbt-row-text{min-width:0;flex:1;display:flex;flex-direction:column}
.dbt-row-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dbt-row-sub{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--dsw-alias-label-tertiary);font-size:12px}
.dbt-avatar{flex:none;display:grid;place-items:center;color:#fff;font-weight:600;user-select:none}
.dbt-main{flex:1;min-width:0;display:flex;flex-direction:column;min-height:0}
.dbt-topbar{height:48px;flex:none;display:flex;align-items:center;gap:10px;padding:0 14px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dbt-topbar-title{display:flex;flex-direction:column;min-width:0;flex:1}
.dbt-chat{flex:1;min-height:0;display:flex;flex-direction:column;position:relative}
.dbt-empty{flex:1;display:grid;place-items:center;text-align:center;color:var(--dsw-alias-label-secondary);padding:24px}
.dbt-empty h3{margin:0 0 6px;color:var(--dsw-alias-label-primary);font-size:15px}
.dbt-details{width:340px;flex:none;border-left:1px solid var(--dsw-alias-border-l1);display:flex;flex-direction:column;min-height:0}
.dbt-tabs{display:flex;gap:2px;padding:8px 8px 0;border-bottom:1px solid var(--dsw-alias-border-l1);flex-wrap:wrap}
.dbt-tab{border:0;background:transparent;color:var(--dsw-alias-label-secondary);padding:7px 9px;border-radius:6px 6px 0 0;cursor:pointer}
.dbt-tab[aria-selected="true"]{color:var(--dsw-alias-label-primary);box-shadow:inset 0 -2px 0 var(--dsw-alias-state-business-primary)}
.dbt-pane{flex:1;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:12px}
.dbt-field{display:flex;flex-direction:column;gap:5px}
.dbt-field>span{color:var(--dsw-alias-label-secondary);font-size:12px}
.dbt-input,.dbt-textarea,.dbt-select{width:100%;box-sizing:border-box;padding:7px 9px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit}
.dbt-textarea{min-height:96px;resize:vertical;line-height:1.5}
.dbt-input:focus,.dbt-textarea:focus,.dbt-select:focus{outline:none;border-color:var(--dsw-alias-state-business-primary)}
.dbt-btn{display:inline-flex;align-items:center;justify-content:center;gap:4px;height:30px;padding:0 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;white-space:nowrap}
.dbt-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dbt-btn:disabled{opacity:.5;cursor:default}
.dbt-btn-primary{background:var(--dsw-alias-button-primary-fill);border-color:transparent;color:var(--dsw-alias-label-primary-foreground)}
.dbt-btn-primary:hover{background:var(--dsw-alias-button-primary-hover)}
.dbt-btn-danger{color:var(--dsw-alias-state-error-primary)}
.dbt-btn-danger:hover{background:var(--dsw-alias-interactive-bg-hover-danger)}
.dbt-icon-btn{width:30px;padding:0}
.dbt-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.dbt-hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5}
.dbt-error{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:1.5}
.dbt-card{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:6px}
.dbt-card-title{font-weight:600}
.dbt-h{font-weight:600;font-size:13px;margin:4px 0 0}
.dbt-swatches{display:flex;gap:6px;flex-wrap:wrap}
.dbt-swatch{width:22px;height:22px;border-radius:50%;border:2px solid transparent;cursor:pointer;padding:0}
.dbt-swatch[aria-pressed="true"]{border-color:var(--dsw-alias-label-primary)}
.dbt-switch{position:relative;width:34px;height:20px;border-radius:10px;border:0;background:var(--dsw-alias-border-l3);cursor:pointer;flex:none;padding:0}
.dbt-switch[aria-checked="true"]{background:var(--dsw-alias-state-business-primary)}
.dbt-switch::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .15s}
.dbt-switch[aria-checked="true"]::after{transform:translateX(14px)}
.dbt-check{display:flex;align-items:center;gap:8px;cursor:pointer}
.dbt-foot{border-top:1px solid var(--dsw-alias-border-l1);padding:8px 10px;display:flex;flex-direction:column;gap:6px}
.dbt-chip{display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:12px}
.dbt-link{border:0;background:transparent;color:var(--dsw-alias-state-business-primary);cursor:pointer;padding:0;font:inherit;font-size:12px}
.dbt-mask{position:absolute;inset:0;background:var(--dsw-alias-bg-mask-2);display:grid;place-items:center;z-index:10}
.dbt-dialog{width:min(460px,calc(100% - 48px));max-height:calc(100% - 48px);overflow:auto;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:12px;box-shadow:0 12px 40px rgba(0,0,0,.25)}
.dbt-dialog h2{margin:0;font-size:15px}
`

    // --- Small components ----------------------------------------------

    function Avatar({ bot, size = 30 }) {
      const shape = bot.avatar?.shape ?? 'circle'
      const style = { width: size, height: size, background: bot.avatar?.color ?? '#3b6ef5', fontSize: Math.round(size * 0.42) }
      if (shape === 'circle') style.borderRadius = '50%'
      if (shape === 'square') style.borderRadius = Math.round(size * 0.22)
      if (shape === 'hexagon') style.clipPath = 'polygon(25% 4%,75% 4%,100% 50%,75% 96%,25% 96%,0 50%)'
      if (shape === 'diamond') style.clipPath = 'polygon(50% 0,100% 50%,50% 100%,0 50%)'
      return h('span', { className: 'dbt-avatar', style, 'aria-hidden': true }, Array.from(bot.name ?? '?')[0])
    }

    function GroupAvatar({ size = 30 }) {
      return h('span', { className: 'dbt-avatar', style: { width: size, height: size, borderRadius: 8, background: 'var(--dsw-alias-bg-layer-3)', color: 'var(--dsw-alias-label-secondary)' }, 'aria-hidden': true }, '#')
    }

    function Switch({ checked, onChange, disabled, label }) {
      return h('button', { type: 'button', role: 'switch', 'aria-checked': checked, 'aria-label': label, className: 'dbt-switch', disabled, onClick: () => onChange(!checked) })
    }

    function Field({ label, children }) {
      return h('label', { className: 'dbt-field' }, h('span', null, label), children)
    }

    function useAsync() {
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState(undefined)
      const run = useCallback(async (task) => {
        setBusy(true)
        setError(undefined)
        try {
          return await task()
        } catch (caught) {
          setError(caught)
          return undefined
        } finally {
          setBusy(false)
        }
      }, [])
      return { busy, error, run, setError }
    }

    function ErrorLine({ error, t }) {
      if (error === undefined) return null
      const key = `code_${error.code}`
      const known = error.code === undefined ? undefined : t(key)
      const text = typeof known === 'string' && known !== '' && known !== key ? known : format(t('error'), { e: error.message })
      return h('div', { className: 'dbt-error', role: 'alert' }, text)
    }

    function Dialog({ title, onClose, children }) {
      useEffect(() => {
        const onKey = (event) => { if (event.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [onClose])
      return h('div', { className: 'dbt-mask', onMouseDown: (event) => { if (event.target === event.currentTarget) onClose() } },
        h('div', { className: 'dbt-dialog', role: 'dialog', 'aria-modal': true, 'aria-label': title }, h('h2', null, title), children))
    }

    function AvatarPicker({ value, onChange, t }) {
      return h(React.Fragment, null,
        h(Field, { label: t('shape') }, h('select', { className: 'dbt-select', value: value.shape, onChange: (e) => onChange({ ...value, shape: e.target.value }) },
          SHAPES.map((shape) => h('option', { key: shape, value: shape }, shape)))),
        h('div', { className: 'dbt-field' }, h('span', null, t('color')), h('div', { className: 'dbt-swatches' },
          COLORS.map((color) => h('button', { key: color, type: 'button', className: 'dbt-swatch', style: { background: color }, 'aria-pressed': value.color === color, 'aria-label': color, onClick: () => onChange({ ...value, color }) })))))
    }

    // --- Dialogs --------------------------------------------------------

    function CreateBotDialog({ t, onClose, onCreated }) {
      const [form, setForm] = useState({ name: '', title: '', description: '', avatar: { shape: 'circle', color: COLORS[0] } })
      const { busy, error, run } = useAsync()
      const submit = async () => {
        const bot = await run(() => api('/bots/create', form))
        if (bot !== undefined) onCreated(bot)
      }
      return h(Dialog, { title: t('newBot'), onClose },
        h(Field, { label: t('name') }, h('input', { className: 'dbt-input', value: form.name, maxLength: 32, autoFocus: true, onChange: (e) => setForm({ ...form, name: e.target.value }) })),
        h(Field, { label: t('jobTitle') }, h('input', { className: 'dbt-input', value: form.title, maxLength: 64, onChange: (e) => setForm({ ...form, title: e.target.value }) })),
        h(Field, { label: t('description') }, h('textarea', { className: 'dbt-textarea', value: form.description, maxLength: 2000, onChange: (e) => setForm({ ...form, description: e.target.value }) })),
        h(AvatarPicker, { value: form.avatar, onChange: (avatar) => setForm({ ...form, avatar }), t }),
        h(ErrorLine, { error, t }),
        h('div', { className: 'dbt-actions' },
          h('button', { type: 'button', className: 'dbt-btn dbt-btn-primary', disabled: busy || form.name.trim() === '', onClick: submit }, busy ? t('creating') : t('create')),
          h('button', { type: 'button', className: 'dbt-btn', onClick: onClose }, t('cancel'))))
    }

    function MemberPicker({ bots, value, onChange }) {
      return h('div', { className: 'dbt-field' }, bots.map((bot) => h('label', { key: bot.id, className: 'dbt-check' },
        h('input', { type: 'checkbox', checked: value.includes(bot.id), onChange: (e) => onChange(e.target.checked ? [...value, bot.id] : value.filter((id) => id !== bot.id)) }),
        h(Avatar, { bot, size: 20 }), bot.name)))
    }

    function CreateGroupDialog({ t, bots, onClose, onCreated }) {
      const [name, setName] = useState('')
      const [members, setMembers] = useState([])
      const { busy, error, run } = useAsync()
      const submit = async () => {
        const group = await run(() => api('/groups/create', { name, members }))
        if (group !== undefined) onCreated(group)
      }
      return h(Dialog, { title: t('newGroup'), onClose },
        h(Field, { label: t('name') }, h('input', { className: 'dbt-input', value: name, maxLength: 32, autoFocus: true, onChange: (e) => setName(e.target.value) })),
        h('div', { className: 'dbt-hint' }, t('groupHint')),
        h(MemberPicker, { bots, value: members, onChange: setMembers }),
        h(ErrorLine, { error, t }),
        h('div', { className: 'dbt-actions' },
          h('button', { type: 'button', className: 'dbt-btn dbt-btn-primary', disabled: busy || name.trim() === '' || members.length < 2 || members.length > 6, onClick: submit }, busy ? t('creating') : t('create')),
          h('button', { type: 'button', className: 'dbt-btn', onClick: onClose }, t('cancel'))))
    }

    // --- Roster ---------------------------------------------------------

    function Roster({ t, data, selected, onSelect, onNewBot, onNewGroup }) {
      const [showHidden, setShowHidden] = useState(false)
      const [howTo, setHowTo] = useState(false)
      const visible = data.bots.filter((bot) => !bot.hidden)
      const hidden = data.bots.filter((bot) => bot.hidden)
      const pinned = visible.filter((bot) => bot.pinned)
      const sections = new Map()
      for (const bot of visible.filter((item) => !item.pinned)) {
        const key = bot.section === '' ? '' : bot.section
        if (!sections.has(key)) sections.set(key, [])
        sections.get(key).push(bot)
      }
      const current = (kind, id) => selected?.kind === kind && selected.id === id ? 'true' : undefined
      const botRow = (bot) => h('button', { key: bot.id, type: 'button', className: 'dbt-row', 'aria-current': current('bot', bot.id), onClick: () => onSelect({ kind: 'bot', id: bot.id }) },
        h(Avatar, { bot }), h('span', { className: 'dbt-row-text' }, h('span', { className: 'dbt-row-name' }, bot.name), bot.title === '' ? null : h('span', { className: 'dbt-row-sub' }, bot.title)))
      const groupRow = (group) => h('button', { key: group.id, type: 'button', className: 'dbt-row', 'aria-current': current('group', group.id), onClick: () => onSelect({ kind: 'group', id: group.id }) },
        h(GroupAvatar, null), h('span', { className: 'dbt-row-text' }, h('span', { className: 'dbt-row-name' }, group.name),
          h('span', { className: 'dbt-row-sub' }, group.members.map((id) => data.bots.find((bot) => bot.id === id)?.name).filter(Boolean).join('、'))))
      const named = [...sections.entries()].filter(([key]) => key !== '').sort(([a], [b]) => a.localeCompare(b))
      return h('nav', { className: 'dbt-roster', 'aria-label': t('title') },
        h('div', { className: 'dbt-roster-head', 'data-window-drag': true },
          h('span', { className: 'dbt-roster-title' }, t('title')),
          h('button', { type: 'button', className: 'dbt-btn dbt-icon-btn', title: t('newGroup'), 'aria-label': t('newGroup'), disabled: data.bots.length < 2, onClick: onNewGroup }, '#'),
          h('button', { type: 'button', className: 'dbt-btn dbt-icon-btn', title: t('newBot'), 'aria-label': t('newBot'), onClick: onNewBot }, '+')),
        h('div', { className: 'dbt-roster-list' },
          data.bots.length === 0 ? h('div', { className: 'dbt-hint', style: { padding: '8px' } }, t('emptyBody')) : null,
          pinned.length > 0 ? h(React.Fragment, null, h('div', { className: 'dbt-label' }, t('pinned')), pinned.map(botRow)) : null,
          named.map(([key, bots]) => h(React.Fragment, { key }, h('div', { className: 'dbt-label' }, key), bots.map(botRow))),
          (sections.get('') ?? []).length > 0 ? h(React.Fragment, null, (pinned.length > 0 || named.length > 0) ? h('div', { className: 'dbt-label' }, t('others')) : null, sections.get('').map(botRow)) : null,
          data.groups.length > 0 ? h(React.Fragment, null, h('div', { className: 'dbt-label' }, t('groups')), data.groups.map(groupRow)) : null,
          hidden.length > 0 ? h(React.Fragment, null,
            h('button', { type: 'button', className: 'dbt-link', style: { padding: '10px 8px 4px' }, onClick: () => setShowHidden(!showHidden) }, `${format(t('hidden'), { n: hidden.length })} · ${showHidden ? t('hideHidden') : t('showHidden')}`),
            showHidden ? hidden.map(botRow) : null) : null),
        h('div', { className: 'dbt-foot' },
          h('div', { className: 'dbt-actions', style: { justifyContent: 'space-between' } },
            h('span', { className: 'dbt-hint' }, t('apps')),
            h('button', { type: 'button', className: 'dbt-link', onClick: () => setHowTo(!howTo) }, t('howToAdd'))),
          data.apps.length === 0
            ? h('span', { className: 'dbt-hint' }, t('noApps'))
            : h('div', { className: 'dbt-actions' }, data.apps.map((app) => h('span', { key: app.server, className: 'dbt-chip', title: app.tools.join(', ') }, `${app.server} · ${app.tools.length}`))),
          howTo ? h('div', { className: 'dbt-hint' }, t('howToAddBody')) : null))
    }

    // --- Conversation ---------------------------------------------------

    /** Retain the selected Session for as long as it is shown; `ready` rejects when the Session no longer exists. */
    function useRetainedSession(sessions, sessionId) {
      const [state, setState] = useState({ reference: undefined, missing: false })
      useEffect(() => {
        if (sessionId === undefined) { setState({ reference: undefined, missing: false }); return undefined }
        let alive = true
        const reference = sessions.retain(sessionId, { source: 'botTeam' })
        setState({ reference, missing: false })
        Promise.resolve(reference.ready).catch(() => { if (alive) setState({ reference: undefined, missing: true }) })
        return () => { alive = false; reference.release() }
      }, [sessions, sessionId])
      return state
    }

    function Chat({ t, sessions, sessionId, SessionProvider, renderSlot, onRecreate }) {
      const { reference, missing } = useRetainedSession(sessions, sessionId)
      const { busy, error, run } = useAsync()
      if (missing) {
        return h('div', { className: 'dbt-empty' }, h('div', null,
          h('p', null, t('missingSession')),
          onRecreate === undefined ? null : h('button', { type: 'button', className: 'dbt-btn dbt-btn-primary', disabled: busy, onClick: () => run(onRecreate) }, t('recreate')),
          h(ErrorLine, { error, t })))
      }
      if (reference === undefined) return h('div', { className: 'dbt-empty' }, t('loading'))
      return h(SessionProvider, { session: reference }, renderSlot(CHAT_SLOT, {}))
    }

    function FixedChatConversationView(props) {
      return h(React.Fragment, null, props.renderSlot('conversation.session', { view: 'chat' }))
    }

    /** The shared Conversation body and composer for the provided Session, as `ui-subagent` embeds it. */
    function ConversationSlotPanel({ sessionId, useSession, useConversation, useSessions, renderFactorySlot }) {
      const session = useSession((value) => value)
      const conversation = useConversation((value) => value)
      const summaryBlank = useSessions((state) => state.byId[sessionId]?.blank)
      const shellPhase = conversation.activeTargets.size > 0 || (!session.blank && !session.awaitingFirstTurn) || session.running ? 'active' : session.promptAttempted ? 'engaging' : 'blank'
      const settling = shellPhase === 'blank' && session.openState === 'loading' && summaryBlank !== true
      const hero = shellPhase === 'blank' && (session.openState === 'open' || summaryBlank === true)
      return renderFactorySlot('conversation.content', { variant: 'embedded', phase: settling ? 'settling' : hero ? 'hero' : 'active', hero }, { slots: { views: FixedChatConversationView } })
    }

    // --- Details: Bot ---------------------------------------------------

    function ProfilePane({ t, bot, refresh }) {
      const [form, setForm] = useState(() => ({ name: bot.name, title: bot.title, description: bot.description, avatar: bot.avatar, section: bot.section }))
      const [saved, setSaved] = useState(false)
      const { busy, error, run } = useAsync()
      useEffect(() => { setForm({ name: bot.name, title: bot.title, description: bot.description, avatar: bot.avatar, section: bot.section }); setSaved(false) }, [bot.id])
      const save = async () => {
        const result = await run(() => api('/bots/update', { id: bot.id, ...form }))
        if (result !== undefined) { setSaved(true); refresh() }
      }
      const toggle = async (patch) => { if (await run(() => api('/bots/update', { id: bot.id, ...patch })) !== undefined) refresh() }
      return h('div', { className: 'dbt-pane' },
        h(Field, { label: t('name') }, h('input', { className: 'dbt-input', value: form.name, maxLength: 32, onChange: (e) => { setForm({ ...form, name: e.target.value }); setSaved(false) } })),
        h(Field, { label: t('jobTitle') }, h('input', { className: 'dbt-input', value: form.title, maxLength: 64, onChange: (e) => { setForm({ ...form, title: e.target.value }); setSaved(false) } })),
        h(Field, { label: t('description') }, h('textarea', { className: 'dbt-textarea', value: form.description, maxLength: 2000, onChange: (e) => { setForm({ ...form, description: e.target.value }); setSaved(false) } })),
        h(AvatarPicker, { value: form.avatar, onChange: (avatar) => { setForm({ ...form, avatar }); setSaved(false) }, t }),
        h(Field, { label: t('section') }, h('input', { className: 'dbt-input', value: form.section, maxLength: 32, placeholder: t('sectionHint'), onChange: (e) => { setForm({ ...form, section: e.target.value }); setSaved(false) } })),
        h(ErrorLine, { error, t }),
        h('div', { className: 'dbt-actions' },
          h('button', { type: 'button', className: 'dbt-btn dbt-btn-primary', disabled: busy || form.name.trim() === '', onClick: save }, saved ? t('saved') : t('save')),
          h('button', { type: 'button', className: 'dbt-btn', disabled: busy, onClick: () => toggle({ pinned: !bot.pinned }) }, bot.pinned ? t('unpin') : t('pin')),
          h('button', { type: 'button', className: 'dbt-btn', disabled: busy, onClick: () => toggle({ hidden: !bot.hidden }) }, bot.hidden ? t('unhide') : t('hide'))))
    }

    function MemoryPane({ t, bot }) {
      const [text, setText] = useState(undefined)
      const [saved, setSaved] = useState(false)
      const { busy, error, run } = useAsync()
      const load = useCallback(() => run(async () => { setText((await api(`/bots/memory?id=${encodeURIComponent(bot.id)}`)).text) }), [bot.id, run])
      useEffect(() => { setText(undefined); load() }, [load])
      const write = async (value) => {
        const result = await run(() => api('/bots/memory', { id: bot.id, text: value }))
        if (result !== undefined) { setText(result.text); setSaved(true) }
      }
      if (text === undefined) return h('div', { className: 'dbt-pane' }, error === undefined ? t('loading') : h(ErrorLine, { error, t }))
      return h('div', { className: 'dbt-pane' },
        h('div', { className: 'dbt-hint' }, t('memoryHint')),
        h('textarea', { className: 'dbt-textarea', style: { minHeight: 220 }, value: text, onChange: (e) => { setText(e.target.value); setSaved(false) } }),
        h(ErrorLine, { error, t }),
        h('div', { className: 'dbt-actions' },
          h('button', { type: 'button', className: 'dbt-btn dbt-btn-primary', disabled: busy, onClick: () => write(text) }, saved ? t('saved') : t('save')),
          h('button', { type: 'button', className: 'dbt-btn dbt-btn-danger', disabled: busy || text === '', onClick: () => write('') }, t('clear'))))
    }

    function SkillsPane({ t, bot }) {
      const [skills, setSkills] = useState(undefined)
      const { busy, error, run } = useAsync()
      useEffect(() => { setSkills(undefined); run(async () => setSkills(await api(`/bots/skills?id=${encodeURIComponent(bot.id)}`))) }, [bot.id, run])
      const move = async (dir, to) => { const result = await run(() => api('/bots/skills/move', { id: bot.id, dir, to })); if (result !== undefined) setSkills(result) }
      if (skills === undefined) return h('div', { className: 'dbt-pane' }, error === undefined ? t('loading') : h(ErrorLine, { error, t }))
      const list = (items, to, label) => items.length === 0 ? h('div', { className: 'dbt-hint' }, t('noSkills')) : items.map((skill) => h('div', { key: skill.dir, className: 'dbt-card' },
        h('div', { className: 'dbt-card-title' }, skill.name), h('div', { className: 'dbt-hint' }, skill.description),
        h('div', { className: 'dbt-actions' }, h('button', { type: 'button', className: 'dbt-btn', disabled: busy, onClick: () => move(skill.dir, to) }, label))))
      return h('div', { className: 'dbt-pane' },
        h('div', { className: 'dbt-h' }, t('private')), list(skills.private, 'shared', t('toShared')),
        h('div', { className: 'dbt-h' }, t('shared')), list(skills.shared, 'private', t('toPrivate')),
        h(ErrorLine, { error, t }))
    }

    function ScheduleCard({ t, bot, record, schedule, reload }) {
      const [editing, setEditing] = useState(false)
      const [form, setForm] = useState({ title: record.title, prompt: record.prompt })
      const [note, setNote] = useState(undefined)
      const { busy, error, run, setError } = useAsync()
      const remote = async (call) => {
        const result = await call()
        if (!result.ok) throw new Error(result.error?.message ?? 'Remote call failed')
        if (result.value?.code !== undefined && result.value.code !== 'ok') throw new Error(result.value.message ?? result.value.code)
        return result.value
      }
      const save = async () => {
        if (await run(() => remote(() => schedule.update({ sessionId: bot.sessionId, id: record.id, expected: record, title: form.title, prompt: form.prompt }))) !== undefined) { setEditing(false); reload() }
      }
      const remove = async () => { if (await run(() => remote(() => schedule.delete({ sessionId: bot.sessionId, id: record.id }))) !== undefined) reload() }
      const test = async () => { setNote(undefined); if (await run(() => api('/routines/test', { id: bot.id, scheduleId: record.id })) !== undefined) setNote(t('tested')) }
      return h('div', { className: 'dbt-card' },
        editing
          ? h(React.Fragment, null,
            h('input', { className: 'dbt-input', value: form.title, onChange: (e) => setForm({ ...form, title: e.target.value }) }),
            h('textarea', { className: 'dbt-textarea', value: form.prompt, onChange: (e) => setForm({ ...form, prompt: e.target.value }) }))
          : h(React.Fragment, null, h('div', { className: 'dbt-card-title' }, record.title), h('div', { className: 'dbt-hint' }, record.prompt)),
        h('div', { className: 'dbt-hint' }, `${record.kind ?? ''} · ${format(t('nextRun'), { t: timeLabel(record.scheduledAt) })}`),
        note === undefined ? null : h('div', { className: 'dbt-hint' }, note),
        h(ErrorLine, { error, t }),
        h('div', { className: 'dbt-actions' },
          editing
            ? h(React.Fragment, null,
              h('button', { type: 'button', className: 'dbt-btn dbt-btn-primary', disabled: busy, onClick: save }, t('save')),
              h('button', { type: 'button', className: 'dbt-btn', onClick: () => { setEditing(false); setError(undefined) } }, t('cancel')))
            : h(React.Fragment, null,
              h('button', { type: 'button', className: 'dbt-btn', disabled: busy, onClick: test }, t('testRun')),
              h('button', { type: 'button', className: 'dbt-btn', disabled: busy, onClick: () => setEditing(true) }, t('edit')),
              h('button', { type: 'button', className: 'dbt-btn dbt-btn-danger', disabled: busy, onClick: remove }, t('delete')))))
    }

    function TriggerCard({ t, trigger, refresh }) {
      const [note, setNote] = useState(undefined)
      const { busy, error, run } = useAsync()
      const act = async (path, body, after) => { const result = await run(() => api(path, body)); if (result !== undefined) { after?.(result); refresh() } }
      return h('div', { className: 'dbt-card' },
        h('div', { className: 'dbt-actions', style: { justifyContent: 'space-between' } },
          h('span', { className: 'dbt-card-title' }, trigger.title),
          h(Switch, { checked: trigger.enabled, disabled: busy, label: trigger.enabled ? t('pause') : t('resume'), onChange: (enabled) => act('/triggers/toggle', { id: trigger.id, enabled }) })),
        h('div', { className: 'dbt-hint' }, `mcp__${trigger.server}__${trigger.tool} · ${trigger.intervalSeconds}s`),
        h('div', { className: 'dbt-hint' }, trigger.prompt),
        trigger.lastRunAt === null ? null : h('div', { className: 'dbt-hint' }, format(t('lastRun'), { t: timeLabel(trigger.lastRunAt) })),
        trigger.lastError === null ? null : h('div', { className: 'dbt-error' }, format(t('lastError'), { e: trigger.lastError })),
        note === undefined ? null : h('div', { className: 'dbt-hint' }, note),
        h(ErrorLine, { error, t }),
        h('div', { className: 'dbt-actions' },
          h('button', { type: 'button', className: 'dbt-btn', disabled: busy, onClick: () => act('/triggers/test', { id: trigger.id }, (result) => setNote(JSON.stringify(result))) }, t('testRun')),
          h('button', { type: 'button', className: 'dbt-btn dbt-btn-danger', disabled: busy, onClick: () => act('/triggers/remove', { id: trigger.id }) }, t('delete'))))
    }

    function RoutinesPane({ t, bot, data, schedule, refresh }) {
      const [records, setRecords] = useState(undefined)
      const { error, run } = useAsync()
      const reload = useCallback(() => run(async () => {
        const result = await schedule.list({ sessionId: bot.sessionId })
        if (!result.ok) throw new Error(result.error?.message ?? 'schedule.list failed')
        setRecords(result.value)
      }), [bot.sessionId, run, schedule])
      useEffect(() => { setRecords(undefined); reload() }, [reload])
      const triggers = data.triggers.filter((trigger) => trigger.botId === bot.id)
      return h('div', { className: 'dbt-pane' },
        h('div', { className: 'dbt-h' }, t('scheduled')),
        records === undefined ? (error === undefined ? h('div', { className: 'dbt-hint' }, t('loading')) : h(ErrorLine, { error, t }))
          : records.length === 0 ? h('div', { className: 'dbt-hint' }, t('noRoutines'))
            : records.map((record) => h(ScheduleCard, { key: record.id, t, bot, record, schedule, reload })),
        h('div', { className: 'dbt-h' }, t('events')),
        triggers.length === 0 ? h('div', { className: 'dbt-hint' }, t('noRoutines')) : triggers.map((trigger) => h(TriggerCard, { key: trigger.id, t, trigger, refresh })))
    }

    function SettingsPane({ t, bot, data, refresh, onRemoved }) {
      const [review, setReview] = useState(undefined)
      const [confirm, setConfirm] = useState(false)
      const { busy, error, run } = useAsync()
      useEffect(() => { setReview(undefined); setConfirm(false); run(async () => setReview(await api(`/bots/auto-review?id=${encodeURIComponent(bot.id)}`))) }, [bot.id, run])
      const toggleReview = async (enabled) => { const result = await run(() => api('/bots/auto-review', { id: bot.id, enabled })); if (result !== undefined) setReview(result) }
      const remove = async () => { if (await run(() => api('/bots/remove', { id: bot.id })) !== undefined) { onRemoved(); refresh() } }
      return h('div', { className: 'dbt-pane' },
        h('div', { className: 'dbt-card' },
          h('div', { className: 'dbt-actions', style: { justifyContent: 'space-between' } },
            h('span', { className: 'dbt-card-title' }, t('autoReview')),
            h(Switch, { checked: review?.enabled === true, disabled: busy || review === undefined || !data.autoReviewAvailable, label: t('autoReview'), onChange: toggleReview })),
          h('div', { className: 'dbt-hint' }, data.autoReviewAvailable ? t('autoReviewHint') : t('autoReviewUnavailable'))),
        h('div', { className: 'dbt-card' },
          h('div', { className: 'dbt-card-title' }, t('deleteBot')),
          h('div', { className: 'dbt-hint' }, t('deleteBotHint')),
          h('div', { className: 'dbt-actions' }, confirm
            ? h(React.Fragment, null,
              h('button', { type: 'button', className: 'dbt-btn dbt-btn-danger', disabled: busy, onClick: remove }, t('confirmDelete')),
              h('button', { type: 'button', className: 'dbt-btn', onClick: () => setConfirm(false) }, t('cancel')))
            : h('button', { type: 'button', className: 'dbt-btn dbt-btn-danger', onClick: () => setConfirm(true) }, t('delete')))),
        h(ErrorLine, { error, t }))
    }

    function BotDetails({ t, bot, data, schedule, refresh, onRemoved }) {
      const [tab, setTab] = useState('profile')
      const tabs = [['profile', t('tabProfile')], ['memory', t('tabMemory')], ['skills', t('tabSkills')], ['routines', t('tabRoutines')], ['settings', t('tabSettings')]]
      return h(React.Fragment, null,
        h('div', { className: 'dbt-tabs', role: 'tablist' }, tabs.map(([id, label]) => h('button', { key: id, type: 'button', role: 'tab', className: 'dbt-tab', 'aria-selected': tab === id, onClick: () => setTab(id) }, label))),
        tab === 'profile' ? h(ProfilePane, { t, bot, refresh }) : null,
        tab === 'memory' ? h(MemoryPane, { t, bot }) : null,
        tab === 'skills' ? h(SkillsPane, { t, bot }) : null,
        tab === 'routines' ? h(RoutinesPane, { t, bot, data, schedule, refresh }) : null,
        tab === 'settings' ? h(SettingsPane, { t, bot, data, refresh, onRemoved }) : null)
    }

    function GroupDetails({ t, group, data, refresh, onRemoved }) {
      const [name, setName] = useState(group.name)
      const [members, setMembers] = useState(group.members)
      const [confirm, setConfirm] = useState(false)
      const { busy, error, run } = useAsync()
      useEffect(() => { setName(group.name); setMembers(group.members); setConfirm(false) }, [group.id])
      const save = async () => { if (await run(() => api('/groups/update', { id: group.id, name, members })) !== undefined) refresh() }
      const remove = async () => { if (await run(() => api('/groups/remove', { id: group.id })) !== undefined) { onRemoved(); refresh() } }
      return h('div', { className: 'dbt-pane' },
        h(Field, { label: t('name') }, h('input', { className: 'dbt-input', value: name, maxLength: 32, onChange: (e) => setName(e.target.value) })),
        h('div', { className: 'dbt-h' }, t('members')), h('div', { className: 'dbt-hint' }, t('groupHint')),
        h(MemberPicker, { bots: data.bots, value: members, onChange: setMembers }),
        h(ErrorLine, { error, t }),
        h('div', { className: 'dbt-actions' },
          h('button', { type: 'button', className: 'dbt-btn dbt-btn-primary', disabled: busy || members.length < 2 || members.length > 6 || name.trim() === '', onClick: save }, t('save')),
          confirm
            ? h('button', { type: 'button', className: 'dbt-btn dbt-btn-danger', disabled: busy, onClick: remove }, t('confirmDelete'))
            : h('button', { type: 'button', className: 'dbt-btn dbt-btn-danger', onClick: () => setConfirm(true) }, t('deleteGroup'))))
    }

    // --- Page -----------------------------------------------------------

    function BotPage({ store, t, sessions, schedule, SessionProvider, renderSlot }) {
      const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)
      const [selected, setSelected] = useState(undefined)
      const [details, setDetails] = useState(false)
      const [dialog, setDialog] = useState(undefined)
      const refresh = useCallback(() => store.refresh(), [store])
      useEffect(() => {
        refresh()
        const timer = setInterval(refresh, 5000)
        const onFocus = () => refresh()
        window.addEventListener('focus', onFocus)
        return () => { clearInterval(timer); window.removeEventListener('focus', onFocus) }
      }, [refresh])
      const data = snapshot.data
      const bot = selected?.kind === 'bot' ? data?.bots.find((item) => item.id === selected.id) : undefined
      const group = selected?.kind === 'group' ? data?.groups.find((item) => item.id === selected.id) : undefined
      useEffect(() => {
        if (data === undefined) return
        if (selected !== undefined && bot === undefined && group === undefined) setSelected(undefined)
        if (selected === undefined) {
          const first = data.bots.find((item) => !item.hidden && item.pinned) ?? data.bots.find((item) => !item.hidden)
          if (first !== undefined) setSelected({ kind: 'bot', id: first.id })
        }
      }, [data, selected, bot, group])

      const frame = h(React.Fragment, null, h('style', null, CSS), h('div', { className: 'dbt-drag', 'data-window-drag': true, 'aria-hidden': true }))
      if (snapshot.status === 'loading') return h('div', { className: 'dbt-page' }, frame, h('div', { className: 'dbt-empty' }, t('loading')))
      if (snapshot.status === 'error') {
        return h('div', { className: 'dbt-page' }, frame, h('div', { className: 'dbt-empty' }, h('div', null,
          h('p', { className: 'dbt-error' }, format(t('error'), { e: snapshot.error.message })),
          h('button', { type: 'button', className: 'dbt-btn', onClick: refresh }, t('retry')))))
      }
      const sessionId = bot?.sessionId ?? group?.sessionId
      const header = bot !== undefined
        ? h(React.Fragment, null, h(Avatar, { bot, size: 28 }), h('div', { className: 'dbt-topbar-title' }, h('span', { className: 'dbt-row-name', style: { fontWeight: 600 } }, bot.name), bot.title === '' ? null : h('span', { className: 'dbt-row-sub' }, bot.title)))
        : group !== undefined
          ? h(React.Fragment, null, h(GroupAvatar, { size: 28 }), h('div', { className: 'dbt-topbar-title' }, h('span', { className: 'dbt-row-name', style: { fontWeight: 600 } }, group.name), h('span', { className: 'dbt-row-sub' }, group.members.map((id) => data.bots.find((item) => item.id === id)?.name).filter(Boolean).join('、'))))
          : null
      return h('div', { className: 'dbt-page' }, frame,
        h(Roster, { t, data, selected, onSelect: setSelected, onNewBot: () => setDialog('bot'), onNewGroup: () => setDialog('group') }),
        h('section', { className: 'dbt-main' },
          sessionId === undefined
            ? h('div', { className: 'dbt-empty' }, h('div', null,
              h('h3', null, data.bots.length === 0 ? t('emptyTitle') : t('pick')),
              data.bots.length === 0 ? h('p', null, t('emptyBody')) : null,
              data.bots.length === 0 ? h('button', { type: 'button', className: 'dbt-btn dbt-btn-primary', onClick: () => setDialog('bot') }, t('newBot')) : null))
            : h(React.Fragment, null,
              h('div', { className: 'dbt-topbar', 'data-window-drag': true }, header,
                h('button', { type: 'button', className: 'dbt-btn', 'aria-expanded': details, onClick: () => setDetails(!details) }, details ? t('close') : t('details'))),
              h('div', { className: 'dbt-chat' }, h(Chat, {
                key: sessionId, t, sessions, sessionId, SessionProvider, renderSlot,
                onRecreate: bot === undefined ? undefined : async () => { await api('/bots/recreate-session', { id: bot.id }); await refresh() },
              })))),
        details && bot !== undefined ? h('aside', { className: 'dbt-details', 'aria-label': t('details') }, h(BotDetails, { key: bot.id, t, bot, data, schedule, refresh, onRemoved: () => setSelected(undefined) })) : null,
        details && group !== undefined ? h('aside', { className: 'dbt-details', 'aria-label': t('details') }, h(GroupDetails, { key: group.id, t, group, data, refresh, onRemoved: () => setSelected(undefined) })) : null,
        dialog === 'bot' ? h(CreateBotDialog, { t, onClose: () => setDialog(undefined), onCreated: async (created) => { setDialog(undefined); await refresh(); setSelected({ kind: 'bot', id: created.id }) } }) : null,
        dialog === 'group' ? h(CreateGroupDialog, { t, bots: data.bots, onClose: () => setDialog(undefined), onCreated: async (created) => { setDialog(undefined); await refresh(); setSelected({ kind: 'group', id: created.id }) } }) : null)
    }

    function PanelIcon() {
      return h('svg', { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': true, fill: 'none', stroke: 'currentColor', strokeWidth: 1.2 },
        h('rect', { x: 2.5, y: 4.5, width: 11, height: 8, rx: 2.5 }),
        h('circle', { cx: 6, cy: 8.5, r: 0.9, fill: 'currentColor', stroke: 'none' }),
        h('circle', { cx: 10, cy: 8.5, r: 0.9, fill: 'currentColor', stroke: 'none' }),
        h('path', { d: 'M8 2v2.5', strokeLinecap: 'round' }))
    }

    // --- @Bot source ----------------------------------------------------

    function escapeLabel(label) {
      return label.replace(/[\\\]]/g, (match) => `\\${match}`)
    }

    function mentionSource(store, t) {
      return {
        trigger: '@',
        name: 'bot',
        showGroupTitle: false,
        async candidates(session, { query }) {
          let data = store.getSnapshot().data
          if (data === undefined) { await store.refresh(); data = store.getSnapshot().data }
          if (data === undefined) return []
          const needle = (query ?? '').toLocaleLowerCase()
          const group = data.groups.find((item) => item.sessionId === session.sessionId)
          const pool = data.bots.filter((bot) => bot.sessionId !== session.sessionId && (group === undefined || group.members.includes(bot.id)))
          const rows = pool
            .filter((bot) => needle === '' || bot.name.toLocaleLowerCase().includes(needle) || bot.title.toLocaleLowerCase().includes(needle))
            .map((bot) => ({ name: bot.name, description: bot.title, icon: 'session', section: t('section_bots'), value: JSON.stringify({ id: bot.id, name: bot.name }) }))
          if (group !== undefined && (needle === '' || 'everyone'.startsWith(needle))) rows.unshift({ name: 'everyone', description: t('everyone'), icon: 'session', section: t('section_bots'), value: JSON.stringify({ everyone: true }) })
          return rows
        },
        onPick({ candidate }) {
          const value = JSON.parse(candidate.value)
          if (value.everyone === true) return { insert: { source: 'bot', ref: '@everyone', label: 'everyone', appearance: 'session', clipboardText: '@everyone' } }
          const ref = `@[${escapeLabel(value.name)}](dsh-bot:${value.id})`
          return { insert: { source: 'bot', ref, label: value.name, appearance: 'session', clipboardText: ref } }
        },
        codec: {
          clipboardText: (ref) => ref,
          serialize: (ref) => Promise.resolve(ref),
        },
      }
    }

    /**
     * Sent-message rendering of `@[name](dsh-bot:id)`. Ordered before the shipped
     * `@file` rule (30), which would otherwise claim the same span as a path.
     */
    const MENTION_PATTERN = /@\[((?:\\.|[^\\\]])*)\]\(dsh-bot:(bot-[0-9a-f]{8})\)/gu
    const botMentionRule = {
      id: 'bot',
      order: 10,
      match(text, from) {
        MENTION_PATTERN.lastIndex = from
        const match = MENTION_PATTERN.exec(text)
        if (match === null) return undefined
        return { id: 'bot', start: match.index, end: match.index + match[0].length, data: { label: match[1].replace(/\\(.)/gu, '$1'), botId: match[2] } }
      },
    }

    function BotMentionChip({ node, raw }) {
      return h('span', {
        title: raw,
        style: { display: 'inline-flex', alignItems: 'center', padding: '0 6px', margin: '0 1px', borderRadius: 6, background: 'var(--dsw-alias-bg-layer-2)', color: 'var(--dsw-alias-state-business-primary)', fontWeight: 500 },
      }, `@${node.data.label}`)
    }

    // --- Plugin ---------------------------------------------------------

    return {
      name: 'dsh-bot-team-client',
      inject: ['slots', 'locale', 'sessions', 'remote', 'remote.schedule'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'bot-team: dictionaries')
        const t = ctx.locale.bind(NS)
        const store = createStore()
        const deps = { store, t, sessions: ctx.sessions, schedule: ctx.remote.schedule }

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          children: { [CHAT_SLOT]: { kind: 'single', scope: 'session' } },
          inject: () => deps,
        }, BotPage))
        ctx.slots.inject(CHAT_SLOT, () => ctx.slots.register({ name: CHAT_SLOT }, ConversationSlotPanel))
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 20,
          label: () => t('panel'),
        }, PanelIcon))

        ctx.inject(['inputTriggers'], (triggerCtx) => {
          triggerCtx.effect(() => triggerCtx.inputTriggers.registerSource(mentionSource(store, t)), 'bot-team: @ source')
        })
        ctx.inject(['uiConversation'], (conversationCtx) => {
          conversationCtx.uiConversation.userText.register(botMentionRule)
        })
        ctx.slots.inject('conversation.user.text.node', () => ctx.slots.register({
          name: 'conversation.user.text.node',
          key: 'bot',
          priority: 100,
        }, BotMentionChip))
      },
    }
  },
})
