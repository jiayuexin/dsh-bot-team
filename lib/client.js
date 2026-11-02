window.__ModuleLoader__.load({
  id: 'dsh-bot-team',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    function Icon() {
      return h('svg', { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': true },
        h('rect', { x: 2.5, y: 4.5, width: 11, height: 8, rx: 2.5, fill: 'none', stroke: 'currentColor', strokeWidth: 1.2 }),
        h('circle', { cx: 6, cy: 8.5, r: 1, fill: 'currentColor' }),
        h('circle', { cx: 10, cy: 8.5, r: 1, fill: 'currentColor' }),
        h('path', { d: 'M8 2v2.5', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' }))
    }

    function Page() {
      const [ping, setPing] = React.useState('…')
      React.useEffect(() => {
        fetch('/plugins/dsh-bot-team/ping', { headers: { 'x-dsh-bot-team': '1' } })
          .then((r) => r.json()).then((v) => setPing(JSON.stringify(v.headers))).catch((e) => setPing(String(e)))
      }, [])
      return h('div', { style: { padding: 24, color: 'var(--dsw-alias-label-primary)' } }, 'Bot Team ping: ', ping)
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'bots' }, Page))
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist', id: 'bots', order: 20, label: 'Bot',
        }, Icon))
      },
    }
  },
})
