import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Snapshot } from '../types'

const PANE = 'token-tracker'

const snapshot = atom<Snapshot | null>(
  { plugin: 'token-tracker', key: 'snapshot' } as const,
  null,
  { shape: 'snap-1' },
)

function shortKind(kind: string): string {
  if (kind === 'five_hour') return 'Ventana 5h'
  if (kind === 'seven_day') return 'Ventana 7d'
  if (kind === 'spend_limit') return 'Gasto'
  return kind
}

function formatReset(iso: string | undefined, nowMs: number): string {
  if (!iso) return '—'
  const resetsAt = Date.parse(iso)
  if (Number.isNaN(resetsAt)) return '—'
  const diffMs = resetsAt - nowMs
  if (diffMs <= 0) return 'reseteando…'
  const mins = Math.round(diffMs / 60000)
  if (mins < 60) return `en ${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const base = m === 0 ? `${h}h` : `${h}h${m}m`
  const d = new Date(resetsAt)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `en ${base} (${hh}:${mm})`
}

function colorFor(pct: number): 'green' | 'yellow' | 'red' {
  if (pct >= 85) return 'red'
  if (pct >= 60) return 'yellow'
  return 'green'
}

function bar(pct: number, width = 20): string {
  const clamped = Math.max(0, Math.min(100, pct))
  const full = Math.round((clamped / 100) * width)
  return '█'.repeat(full) + '░'.repeat(Math.max(0, width - full))
}

async function refresh($: any): Promise<void> {
  try {
    const usage = await $.session.usage()
    const now = await $.clock.now()
    const snap: Snapshot = {
      contextPercent: usage.context.percent ?? null,
      contextTokens: usage.context.tokens ?? null,
      contextWindow: usage.context.window ?? null,
      rateLimits: usage.rateLimits.map((r: any) => ({
        kind: r.kind,
        percentUsed: r.percentUsed,
        resetsAt: r.resetsAt,
      })),
      updatedAt: now,
    }
    await update($, snapshot, () => snap)
  } catch {}
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'tokens',
      description: 'Abrir el pane de uso de tokens',
    })
    await refresh($)
    void $.ui.open({ id: PANE, title: 'Tokens' })
    $.clock.every(30_000, () => refresh($))
    return next(e)
  })

  on('command.run', { command: 'tokens' }, async $ => {
    await refresh($)
    await $.ui.open({ id: PANE, title: 'Tokens' })
    return { text: 'Pane de tokens abierto.' }
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await refresh($)
    return result
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const snap = await read($, snapshot)

    if (!snap) {
      return (
        <Box flexDirection="column">
          <Text dimColor>Cargando datos de uso…</Text>
        </Box>
      )
    }

    const ctxPct = snap.contextPercent
    const ctxTok = snap.contextTokens
    const ctxWin = snap.contextWindow

    return (
      <Box flexDirection="column">
        <Text bold>Contexto del turno</Text>
        {ctxPct !== null ? (
          <>
            <Text color={colorFor(ctxPct)}>
              {bar(ctxPct)} {ctxPct}%
            </Text>
            {ctxTok !== null && ctxWin !== null && (
              <Text dimColor>
                {ctxTok.toLocaleString()} / {ctxWin.toLocaleString()} tokens
              </Text>
            )}
          </>
        ) : (
          <Text dimColor>sin datos aún</Text>
        )}

        <Text> </Text>
        <Text bold>Límites de cuenta</Text>
        {snap.rateLimits.length === 0 ? (
          <Text dimColor>sin ventanas activas</Text>
        ) : (
          snap.rateLimits.map(rl => {
            const pct = Math.round(rl.percentUsed)
            const remaining = Math.max(0, 100 - pct)
            return (
              <Box key={rl.kind} flexDirection="column">
                <Text> </Text>
                <Text bold>{shortKind(rl.kind)}</Text>
                <Text color={colorFor(pct)}>
                  {bar(pct)} {pct}%
                </Text>
                <Text dimColor>Queda {remaining}% · Reset {formatReset(rl.resetsAt, snap.updatedAt)}</Text>
              </Box>
            )
          })
        )}

        <Text> </Text>
        <Text dimColor>Actualizado hace {Math.round((Date.now() - snap.updatedAt) / 1000)}s</Text>
      </Box>
    )
  })
}
