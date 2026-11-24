import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowUpDown, Check, Loader2, Pencil, Plus, Trash2, Undo2, Wand2, X } from 'lucide-react'
import { db, type AIMessage } from '../lib/db'
import { useLiveQuery } from 'dexie-react-hooks'
import { applyActions, previewActions, undoActions, type AgentAction, type PlannedAction } from '../lib/agent'
import { cn } from '../lib/utils'

const ICON = {
  create: <Plus size={13} />,
  update: <Pencil size={12} />,
  move: <ArrowUpDown size={12} />,
  delete: <Trash2 size={12} />,
}

export function ActionProposal({ message, actions }: { message: AIMessage; actions: AgentAction[] }) {
  const [plan, setPlan] = useState<PlannedAction[] | null>(null)
  const [selected, setSelected] = useState<boolean[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const state = message.actionsState
  // La instantánea para deshacer se guarda en la base de datos: sobrevive a recargas
  const undoRecord = useLiveQuery(() => db.undos.get(message.id), [message.id])

  useEffect(() => {
    if (state) return
    let alive = true
    previewActions(message.novelId, actions).then((p) => {
      if (!alive) return
      setPlan(p)
      // Por seguridad, los borrados vienen desmarcados
      setSelected(p.map((a) => a.ok && a.kind !== 'delete'))
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message.id, state])

  const apply = async () => {
    if (!plan) return
    setBusy(true)
    setError(null)
    try {
      const chosen = actions.filter((_, i) => selected[i])
      const { results, snapshot } = await applyActions(message.novelId, chosen)
      if (snapshot) await db.undos.put({ id: message.id, novelId: message.novelId, snapshot, createdAt: Date.now() })
      const done = results.filter((r) => r.ok).map((r) => r.label)
      const failed = results.filter((r) => !r.ok)
      await db.messages.update(message.id, { actionsState: 'applied', appliedLabels: done })
      if (failed.length) setError(`${failed.length} cambio(s) no se pudieron aplicar: ${failed.map((f) => f.error).join('; ')}`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const undo = async () => {
    if (!undoRecord) return
    setBusy(true)
    try {
      const newer = await db.undos
        .where('novelId')
        .equals(message.novelId)
        .filter((u) => u.createdAt > undoRecord.createdAt)
        .count()
      if (
        newer &&
        !confirm(
          'Después de estos cambios aplicaste otros. Deshacer solo revierte lo de esta propuesta; puede dejar la estructura a medias. ¿Continuar?',
        )
      )
        return
      const { keptChapters } = await undoActions(undoRecord.snapshot)
      await db.undos.delete(message.id)
      if (keptChapters) setError(`${keptChapters} capítulo(s) creados por la IA se han conservado porque ya tienen texto.`)
      await db.messages.update(message.id, { actionsState: 'undone' })
    } finally {
      setBusy(false)
    }
  }

  /* --- Ya aplicada / deshecha / descartada --- */
  if (state) {
    const canUndo = state === 'applied' && !!undoRecord
    return (
      <div
        className={cn(
          'mt-2 rounded-xl border p-3 text-sm',
          state === 'applied' ? 'border-green-500/30 bg-green-500/5' : 'border-line bg-surface-2/50',
        )}
      >
        <div className="flex items-center gap-2 font-medium">
          {state === 'applied' ? (
            <Check size={14} className="text-green-600 dark:text-green-400" />
          ) : (
            <X size={14} className="text-subtle" />
          )}
          {state === 'applied'
            ? `${message.appliedLabels?.length ?? 0} cambios aplicados`
            : state === 'undone'
              ? 'Cambios deshechos'
              : 'Propuesta descartada'}
          {canUndo && (
            <button className="btn-ghost ml-auto h-7 px-2 text-xs" onClick={undo} disabled={busy}>
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Undo2 size={12} />} Deshacer
            </button>
          )}
        </div>
        {state === 'applied' && message.appliedLabels && (
          <ul className="mt-2 space-y-0.5 text-xs text-muted">
            {message.appliedLabels.map((l, i) => (
              <li key={i}>· {l}</li>
            ))}
          </ul>
        )}
        {error && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{error}</p>}
      </div>
    )
  }

  /* --- Propuesta pendiente --- */
  const count = selected.filter(Boolean).length
  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-accent/40 bg-accent-soft/40">
      <div className="flex items-center gap-2 border-b border-accent/20 px-3 py-2 text-sm font-medium">
        <Wand2 size={14} className="text-accent" /> Cambios propuestos
        <span className="text-xs font-normal text-subtle">{actions.length}</span>
      </div>
      {!plan ? (
        <div className="flex items-center gap-2 p-3 text-xs text-muted">
          <Loader2 size={12} className="animate-spin" /> Comprobando…
        </div>
      ) : (
        <ul className="divide-y divide-line/60">
          {plan.map((p, i) => (
            <li key={i}>
              <label className={cn('flex cursor-pointer gap-2.5 px-3 py-2 text-sm', !p.ok && 'cursor-not-allowed opacity-60')}>
                <input
                  type="checkbox"
                  className="mt-1 accent-[var(--accent)]"
                  disabled={!p.ok}
                  checked={!!selected[i]}
                  onChange={(e) => setSelected((s) => s.map((v, j) => (j === i ? e.target.checked : v)))}
                />
                <span
                  className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md',
                    p.kind === 'delete' ? 'bg-red-500/15 text-red-600' : 'bg-surface text-accent',
                  )}
                >
                  {p.ok ? ICON[p.kind] : <AlertTriangle size={12} className="text-amber-600" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block leading-snug">{p.label}</span>
                  {p.detail && <span className="mt-0.5 block text-xs text-muted">{p.detail}</span>}
                  {p.error && <span className="mt-0.5 block text-xs text-amber-700 dark:text-amber-400">{p.error}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-end gap-2 border-t border-accent/20 px-3 py-2">
        <button className="btn-ghost h-8 text-xs" onClick={() => db.messages.update(message.id, { actionsState: 'dismissed' })}>
          Descartar
        </button>
        <button className="btn-primary h-8 text-xs" disabled={!plan || !count || busy} onClick={apply}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Aplicar {count} {count === 1 ? 'cambio' : 'cambios'}
        </button>
      </div>
      {error && <p className="px-3 pb-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}
