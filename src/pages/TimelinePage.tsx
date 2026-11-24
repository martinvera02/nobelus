import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { ChevronDown, ChevronUp, History, MapPin, Plus } from 'lucide-react'
import { db, type Entity } from '../lib/db'
import { createEntity, useNovelData } from '../lib/actions'
import { cn } from '../lib/utils'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/ui'

export default function TimelinePage() {
  const { novelId, entities } = useNovelData()
  const navigate = useNavigate()
  const events = (entities ?? []).filter((e) => e.type === 'event').sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  const swap = async (a: Entity, b: Entity) => {
    const ao = a.order ?? 0
    const bo = b.order ?? 0
    await db.transaction('rw', db.entities, async () => {
      await db.entities.update(a.id, { order: bo === ao ? ao + 1 : bo })
      await db.entities.update(b.id, { order: ao })
    })
  }

  const add = async () => navigate(`/novel/${novelId}/wiki/${await createEntity(novelId, 'event', 'Nuevo evento')}`)

  return (
    <div>
      <PageHeader
        crumbs={<span className="text-fg">Cronología</span>}
        actions={
          <button className="btn-primary h-8" onClick={add}>
            <Plus size={14} /> Evento
          </button>
        }
      />
      <div className="mx-auto max-w-4xl px-4 sm:px-8 pb-24 pt-6">
        <h1 className="flex items-center gap-3 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
          <History size={30} className="text-accent" /> Cronología
        </h1>
        <p className="mt-1 text-muted">La historia de tu mundo en orden. Los eventos son entradas de la wiki: ábrelos para detallarlos.</p>

        {entities && events.length === 0 && (
          <div className="mt-8">
            <EmptyState
              icon={<History size={22} />}
              title="Sin eventos"
              text="Añade batallas, nacimientos, catástrofes o cualquier hito para ordenar la historia de tu mundo."
              action={
                <button className="btn-primary" onClick={add}>
                  <Plus size={15} /> Primer evento
                </button>
              }
            />
          </div>
        )}

        <div className="relative mt-10">
          {events.length > 0 && <div className="absolute bottom-0 left-4 top-0 w-px bg-line md:left-1/2" />}
          <div className="space-y-6">
            {events.map((e, i) => {
              const left = i % 2 === 0
              return (
                <motion.div
                  key={e.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn('relative pl-12 md:w-1/2 md:pl-0', left ? 'md:pr-10' : 'md:ml-auto md:pl-10')}
                >
                  <span
                    className={cn(
                      'absolute top-5 h-3.5 w-3.5 rounded-full border-[3px] border-bg bg-accent',
                      left ? 'left-[10px] md:left-auto md:-right-[7px]' : 'left-[10px] md:-left-[7px]',
                    )}
                  />
                  <div className="card group p-4 transition hover:shadow-soft">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-accent">{e.fields.date || 'Sin fecha'}</div>
                      <div className="flex opacity-0 transition group-hover:opacity-100">
                        <button className="icon-btn h-6 w-6" disabled={i === 0} onClick={() => swap(e, events[i - 1])} title="Antes">
                          <ChevronUp size={14} />
                        </button>
                        <button
                          className="icon-btn h-6 w-6"
                          disabled={i === events.length - 1}
                          onClick={() => swap(e, events[i + 1])}
                          title="Después"
                        >
                          <ChevronDown size={14} />
                        </button>
                      </div>
                    </div>
                    <Link to={`/novel/${novelId}/wiki/${e.id}`} className="mt-1 block font-serif text-lg font-semibold hover:underline">
                      {e.emoji ? `${e.emoji} ` : ''}
                      {e.name}
                    </Link>
                    {e.summary && <p className="mt-1 text-sm text-muted">{e.summary}</p>}
                    {(e.fields.place || e.fields.involved) && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {e.fields.place && (
                          <span className="chip">
                            <MapPin size={11} /> {e.fields.place}
                          </span>
                        )}
                        {e.fields.involved && <span className="chip">{e.fields.involved}</span>}
                      </div>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
