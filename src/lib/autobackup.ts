/**
 * Copias de seguridad automáticas en una carpeta del ordenador.
 *
 * Usa la File System Access API (Chrome, Edge, Opera): el navegador guarda el permiso para la carpeta elegida.
 * Cada día se escribe `nobelus-copia-AAAA-MM-DD.json` con toda la biblioteca (se sobrescribe a lo largo del día
 * para que sea siempre la más reciente) y se conservan los últimos KEEP_DAYS días.
 */
import { db } from './db'
import { buildLibraryBackup } from './backup'

const KEEP_DAYS = 14
const MIN_INTERVAL = 10 * 60 * 1000 // como mucho una copia cada 10 minutos

type Permission = 'granted' | 'denied' | 'prompt'
interface DirHandle extends FileSystemDirectoryHandle {
  queryPermission(o: { mode: 'readwrite' }): Promise<Permission>
  requestPermission(o: { mode: 'readwrite' }): Promise<Permission>
}

export const fsSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window

export interface BackupStatus {
  supported: boolean
  folder: string | null
  permission: Permission | null
  lastAt: number | null
  lastError: string | null
  persisted: boolean | null
}

async function getHandle() {
  return ((await db.kv.get('backupDir'))?.value as DirHandle | undefined) ?? null
}

export async function getBackupStatus(): Promise<BackupStatus> {
  const h = await getHandle()
  let permission: Permission | null = null
  try {
    permission = h ? await h.queryPermission({ mode: 'readwrite' }) : null
  } catch {
    permission = null
  }
  return {
    supported: fsSupported(),
    folder: h?.name ?? null,
    permission,
    lastAt: ((await db.kv.get('backupLastAt'))?.value as number) ?? null,
    lastError: ((await db.kv.get('backupLastError'))?.value as string) ?? null,
    persisted: navigator.storage?.persisted ? await navigator.storage.persisted() : null,
  }
}

/** Pide al navegador que no borre los datos de Nobelus aunque falte espacio. */
export async function requestPersistentStorage() {
  try {
    return navigator.storage?.persist ? await navigator.storage.persist() : false
  } catch {
    return false
  }
}

/** Abre el selector de carpeta (necesita un clic del usuario). */
export async function chooseBackupFolder() {
  const picker = (window as unknown as { showDirectoryPicker: (o: object) => Promise<DirHandle> }).showDirectoryPicker
  const handle = await picker({ id: 'nobelus-backups', mode: 'readwrite', startIn: 'documents' })
  await db.kv.put({ key: 'backupDir', value: handle })
  await requestPersistentStorage()
  return runBackup({ force: true })
}

export async function forgetBackupFolder() {
  await db.kv.delete('backupDir')
}

/** Recupera el permiso tras reiniciar el navegador (necesita un clic del usuario). */
export async function resumeBackups() {
  const h = await getHandle()
  if (!h) return false
  const p = await h.requestPermission({ mode: 'readwrite' })
  if (p === 'granted') await runBackup({ force: true })
  return p === 'granted'
}

const today = () => new Date().toISOString().slice(0, 10)

/**
 * Escribe la copia del día. Sin `force`, no hace nada si la última copia es muy reciente
 * o si el navegador aún no ha devuelto el permiso de la carpeta.
 */
export async function runBackup({ force = false } = {}): Promise<'done' | 'skipped' | 'no-folder' | 'needs-permission' | 'empty'> {
  const h = await getHandle()
  if (!h) return 'no-folder'
  if ((await h.queryPermission({ mode: 'readwrite' })) !== 'granted') return 'needs-permission'
  const last = ((await db.kv.get('backupLastAt'))?.value as number) ?? 0
  if (!force && Date.now() - last < MIN_INTERVAL) return 'skipped'

  try {
    if ((await writeBackupTo(h)) === 'empty') return 'empty'
    await db.kv.bulkPut([
      { key: 'backupLastAt', value: Date.now() },
      { key: 'backupLastError', value: null },
    ])
    window.dispatchEvent(new Event('nobelus:backup'))
    return 'done'
  } catch (e) {
    await db.kv.put({ key: 'backupLastError', value: (e as Error).message })
    window.dispatchEvent(new Event('nobelus:backup'))
    throw e
  }
}

/** Escribe la copia del día en una carpeta y borra las que pasen de KEEP_DAYS. */
export async function writeBackupTo(dir: FileSystemDirectoryHandle): Promise<'done' | 'empty'> {
  const data = await buildLibraryBackup()
  if (!data.novels.length) return 'empty'
  const file = await dir.getFileHandle(`nobelus-copia-${today()}.json`, { create: true })
  const w = await file.createWritable()
  await w.write(JSON.stringify(data))
  await w.close()

  const names: string[] = []
  for await (const entry of (dir as unknown as { values(): AsyncIterable<FileSystemHandle> }).values()) {
    if (entry.kind === 'file' && /^nobelus-copia-\d{4}-\d{2}-\d{2}\.json$/.test(entry.name)) names.push(entry.name)
  }
  names.sort().reverse()
  for (const old of names.slice(KEEP_DAYS)) await dir.removeEntry(old)
  return 'done'
}

/** Programa copias periódicas mientras la app esté abierta. Devuelve la función para pararlas. */
export function startAutoBackup() {
  const tick = () => runBackup().catch(() => {})
  const first = window.setTimeout(tick, 5000)
  const every = window.setInterval(tick, MIN_INTERVAL)
  const onHide = () => document.visibilityState === 'hidden' && tick()
  document.addEventListener('visibilitychange', onHide)
  return () => {
    window.clearTimeout(first)
    window.clearInterval(every)
    document.removeEventListener('visibilitychange', onHide)
  }
}
