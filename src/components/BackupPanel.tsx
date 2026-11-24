import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, FolderOpen, HardDriveDownload, Loader2, RefreshCw, ShieldCheck, X } from 'lucide-react'
import {
  chooseBackupFolder,
  forgetBackupFolder,
  getBackupStatus,
  requestPersistentStorage,
  resumeBackups,
  runBackup,
  type BackupStatus,
} from '../lib/autobackup'
import { exportLibraryJSON } from '../lib/backup'
import { cn, timeAgo } from '../lib/utils'

export function useBackupStatus() {
  const [status, setStatus] = useState<BackupStatus | null>(null)
  const refresh = useCallback(() => {
    getBackupStatus().then(setStatus)
  }, [])
  useEffect(() => {
    refresh()
    window.addEventListener('nobelus:backup', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.removeEventListener('nobelus:backup', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [refresh])
  return { status, refresh }
}

/** Panel completo de copias (en Ajustes). */
export function BackupPanel() {
  const { status, refresh } = useBackupStatus()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setMsg(null)
    try {
      await fn()
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setMsg((e as Error).message)
    } finally {
      setBusy(false)
      refresh()
    }
  }

  if (!status) return null

  return (
    <div className="space-y-3">
      {status.supported ? (
        <div
          className={cn(
            'rounded-xl border p-3 text-sm',
            status.folder && status.permission === 'granted' ? 'border-green-500/30 bg-green-500/5' : 'border-amber-500/40 bg-amber-500/5',
          )}
        >
          <div className="flex items-start gap-3">
            {status.folder && status.permission === 'granted' ? (
              <CheckCircle2 size={16} className="mt-0.5 text-green-600 dark:text-green-400" />
            ) : (
              <AlertTriangle size={16} className="mt-0.5 text-amber-600" />
            )}
            <div className="flex-1">
              {!status.folder && (
                <>
                  <b>Copias automáticas desactivadas.</b> Elige una carpeta (mejor si se sincroniza con OneDrive o Google Drive) y Nobelus
                  guardará allí una copia de toda tu biblioteca cada día, conservando las últimas dos semanas.
                </>
              )}
              {status.folder && status.permission === 'granted' && (
                <>
                  Copias automáticas en <b>{status.folder}</b>.{' '}
                  {status.lastAt ? `Última: ${timeAgo(status.lastAt)}.` : 'Aún no se ha hecho ninguna.'}
                </>
              )}
              {status.folder && status.permission !== 'granted' && (
                <>
                  <b>Copias en pausa.</b> El navegador pide confirmar de nuevo el acceso a la carpeta <b>{status.folder}</b> después de
                  reiniciarse.
                </>
              )}
              {status.lastError && <div className="mt-1 text-xs text-red-600 dark:text-red-400">Último error: {status.lastError}</div>}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {!status.folder && (
              <button className="btn-primary" disabled={busy} onClick={() => run(chooseBackupFolder)}>
                <FolderOpen size={15} /> Elegir carpeta
              </button>
            )}
            {status.folder && status.permission !== 'granted' && (
              <button className="btn-primary" disabled={busy} onClick={() => run(resumeBackups)}>
                <RefreshCw size={15} /> Reanudar copias
              </button>
            )}
            {status.folder && status.permission === 'granted' && (
              <button className="btn-outline" disabled={busy} onClick={() => run(() => runBackup({ force: true }))}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <HardDriveDownload size={15} />} Hacer copia ahora
              </button>
            )}
            {status.folder && (
              <>
                <button className="btn-ghost" disabled={busy} onClick={() => run(chooseBackupFolder)}>
                  Cambiar carpeta
                </button>
                <button className="btn-ghost" disabled={busy} onClick={() => run(forgetBackupFolder)}>
                  <X size={14} /> Desactivar
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          Este navegador no permite guardar en una carpeta. Usa Chrome o Edge para las copias automáticas, o descarga copias manuales con el
          botón de abajo.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-outline" onClick={() => exportLibraryJSON()}>
          <Download size={15} /> Descargar copia de toda la biblioteca
        </button>
        {status.persisted === false && (
          <button className="btn-ghost" onClick={() => requestPersistentStorage().then(refresh)}>
            <ShieldCheck size={15} /> Proteger datos del navegador
          </button>
        )}
        {status.persisted && (
          <span className="flex items-center gap-1.5 text-xs text-subtle">
            <ShieldCheck size={13} /> El navegador no borrará tus datos por falta de espacio
          </span>
        )}
      </div>
      {msg && <p className="text-sm text-red-600 dark:text-red-400">{msg}</p>}
      <p className="text-xs text-subtle">
        Para restaurar, usa «Importar» en la biblioteca con cualquier archivo de copia. Si la novela ya no existe se recupera tal cual; si
        existe, se importa como copia.
      </p>
    </div>
  )
}

/** Aviso compacto para la biblioteca: solo aparece si las copias no están funcionando. */
export function BackupBanner({ hasNovels }: { hasNovels: boolean }) {
  const { status, refresh } = useBackupStatus()
  const [hidden, setHidden] = useState(() => sessionStorage.getItem('nobelus-backup-banner') === 'off')
  const [busy, setBusy] = useState(false)
  if (!status || !hasNovels || hidden) return null
  const ok = status.folder && status.permission === 'granted'
  if (ok) return null

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
    } catch {
      /* cancelado */
    } finally {
      setBusy(false)
      refresh()
    }
  }

  return (
    <div className="fade-in mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm">
      <AlertTriangle size={16} className="text-amber-600" />
      <span className="flex-1">
        {status.folder
          ? 'Las copias automáticas están en pausa hasta que confirmes el acceso a la carpeta.'
          : status.supported
            ? 'Tus novelas solo están guardadas en este navegador. Activa las copias automáticas en una carpeta.'
            : 'Tus novelas solo están guardadas en este navegador. Descarga una copia de vez en cuando.'}
      </span>
      {status.supported ? (
        <button className="btn-primary h-8" disabled={busy} onClick={() => act(status.folder ? resumeBackups : chooseBackupFolder)}>
          {status.folder ? <RefreshCw size={14} /> : <FolderOpen size={14} />} {status.folder ? 'Reanudar' : 'Elegir carpeta'}
        </button>
      ) : (
        <button className="btn-primary h-8" onClick={() => exportLibraryJSON()}>
          <Download size={14} /> Descargar copia
        </button>
      )}
      <button
        className="icon-btn"
        title="Ocultar por ahora"
        onClick={() => {
          sessionStorage.setItem('nobelus-backup-banner', 'off')
          setHidden(true)
        }}
      >
        <X size={14} />
      </button>
    </div>
  )
}
