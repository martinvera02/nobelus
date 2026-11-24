import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Panel,
  Handle,
  Position,
  BaseEdge,
  EdgeLabelRenderer,
  ConnectionMode,
  MarkerType,
  useConnection,
  useInternalNode,
  useNodesState,
  useEdgesState,
  useReactFlow,
  getStraightPath,
  type Node,
  type Edge,
  type NodeProps,
  type EdgeProps,
  type Connection,
  type InternalNode,
} from '@xyflow/react'
import { ArrowLeftRight, LayoutGrid, Plus, Trash2, X } from 'lucide-react'
import { db, type Entity, type EntityType, type Relation, type RelationKind } from '../lib/db'
import { ENTITY_TYPES, RELATION_KINDS, typeDef } from '../lib/schema'
import { createEntity, useNovelData } from '../lib/actions'
import { cn, uid } from '../lib/utils'
import { PageHeader } from '../components/PageHeader'

type EntityNode = Node<{ entity: Entity; dimmed: boolean }, 'entity'>
type RelEdge = Edge<{ relation: Relation; dimmed: boolean }, 'relation'>

/* ---------- Nodo ---------- */
const EntityNodeView = memo(function EntityNodeView({ data, selected }: NodeProps<EntityNode>) {
  const e = data.entity
  const def = typeDef(e.type)
  const connecting = useConnection((c) => c.inProgress)
  const color = e.color || def.color
  return (
    <div
      className={cn(
        'group relative flex w-44 items-center gap-2.5 rounded-2xl border bg-surface px-3 py-2.5 shadow-soft transition-opacity',
        selected ? 'border-accent ring-2 ring-[var(--ring)]' : 'border-line',
        data.dimmed && 'opacity-25',
      )}
    >
      {e.image ? (
        <img src={e.image} className="h-10 w-10 shrink-0 rounded-full object-cover" style={{ boxShadow: `0 0 0 2px ${color}` }} />
      ) : (
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl"
          style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, boxShadow: `0 0 0 2px ${color}` }}
        >
          {e.emoji || def.emoji}
        </span>
      )}
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold leading-tight text-fg">{e.name}</div>
        <div className="truncate text-[11px] text-muted">{e.fields.role || def.label}</div>
      </div>

      {/* Asa de origen: arrastra desde aquí para crear una relación */}
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3.5 !w-3.5 !border-2 !border-surface !bg-accent opacity-0 transition group-hover:opacity-100"
      />
      {/* Destino invisible que cubre todo el nodo mientras se conecta */}
      {connecting && (
        <Handle
          type="target"
          position={Position.Left}
          isConnectableStart={false}
          className="!absolute !inset-0 !h-full !w-full !translate-x-0 !translate-y-0 !rounded-2xl !border-0 !opacity-0"
        />
      )}
    </div>
  )
})

/* ---------- Arista "flotante" que sale del borde del nodo ---------- */
function intersection(a: InternalNode, b: InternalNode) {
  const w = (a.measured.width ?? 176) / 2
  const h = (a.measured.height ?? 60) / 2
  const ax = a.internals.positionAbsolute.x + w
  const ay = a.internals.positionAbsolute.y + h
  const bx = b.internals.positionAbsolute.x + (b.measured.width ?? 176) / 2
  const by = b.internals.positionAbsolute.y + (b.measured.height ?? 60) / 2
  const dx = bx - ax
  const dy = by - ay
  if (!dx && !dy) return { x: ax, y: ay }
  const s = Math.min(Math.abs(w / (dx || 1e-6)), Math.abs(h / (dy || 1e-6)))
  return { x: ax + dx * s, y: ay + dy * s }
}

function RelationEdgeView({ id, source, target, data, selected, markerEnd }: EdgeProps<RelEdge>) {
  const s = useInternalNode(source)
  const t = useInternalNode(target)
  if (!s || !t || !data) return null
  const p1 = intersection(s, t)
  const p2 = intersection(t, s)
  const [path, lx, ly] = getStraightPath({ sourceX: p1.x, sourceY: p1.y, targetX: p2.x, targetY: p2.y })
  const k = RELATION_KINDS[data.relation.kind]
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        interactionWidth={18}
        style={{
          stroke: k.color,
          strokeWidth: selected ? 3 : 2,
          strokeDasharray: k.dashed ? '6 5' : undefined,
          opacity: data.dimmed ? 0.15 : 0.9,
        }}
      />
      <EdgeLabelRenderer>
        <div
          className={cn(
            'nodrag nopan pointer-events-auto absolute cursor-pointer rounded-full border bg-surface px-2 py-0.5 text-[11px] font-medium shadow-sm transition-opacity',
            selected ? 'border-accent' : 'border-line',
            data.dimmed && 'opacity-20',
          )}
          style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`, color: k.color }}
        >
          {data.relation.label || k.label}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

const nodeTypes = { entity: EntityNodeView }
const edgeTypes = { relation: RelationEdgeView }

/* ---------- Página ---------- */
export default function RelationsPage() {
  return (
    <ReactFlowProvider>
      <Graph />
    </ReactFlowProvider>
  )
}

function circleLayout(n: number, i: number) {
  const r = Math.max(220, n * 45)
  const a = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2
  return { x: Math.cos(a) * r, y: Math.sin(a) * r }
}

function Graph() {
  const { novelId, entities } = useNovelData()
  const relations = useLiveQuery(() => db.relations.where('novelId').equals(novelId).toArray(), [novelId])
  const [types, setTypes] = useState<EntityType[]>(['character', 'faction'])
  const [focusId, setFocusId] = useState<string | null>(null)
  const [edgeId, setEdgeId] = useState<string | null>(null)
  const navigate = useNavigate()
  const rf = useReactFlow()

  const visible = useMemo(() => (entities ?? []).filter((e) => types.includes(e.type)), [entities, types])

  const neighbours = useMemo(() => {
    if (!focusId) return null
    const s = new Set([focusId])
    relations?.forEach((r) => {
      if (r.source === focusId) s.add(r.target)
      if (r.target === focusId) s.add(r.source)
    })
    return s
  }, [focusId, relations])

  const [nodes, setNodes, onNodesChange] = useNodesState<EntityNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<RelEdge>([])

  useEffect(() => {
    setNodes((prev) => {
      const prevMap = new Map(prev.map((n) => [n.id, n]))
      return visible.map((e, i) => ({
        id: e.id,
        type: 'entity',
        position: prevMap.get(e.id)?.dragging ? prevMap.get(e.id)!.position : (e.pos ?? circleLayout(visible.length, i)),
        selected: prevMap.get(e.id)?.selected,
        data: { entity: e, dimmed: !!neighbours && !neighbours.has(e.id) },
      }))
    })
  }, [visible, neighbours, setNodes])

  useEffect(() => {
    const ids = new Set(visible.map((e) => e.id))
    setEdges(
      (relations ?? [])
        .filter((r) => ids.has(r.source) && ids.has(r.target))
        .map((r) => ({
          id: r.id,
          type: 'relation',
          source: r.source,
          target: r.target,
          selected: r.id === edgeId,
          markerEnd: { type: MarkerType.ArrowClosed, color: RELATION_KINDS[r.kind].color, width: 16, height: 16 },
          data: { relation: r, dimmed: !!focusId && r.source !== focusId && r.target !== focusId },
        })),
    )
  }, [relations, visible, focusId, edgeId, setEdges])

  const onConnect = useCallback(
    async (c: Connection) => {
      if (!c.source || !c.target || c.source === c.target) return
      const id = uid()
      await db.relations.add({ id, novelId, source: c.source, target: c.target, kind: 'otro', createdAt: Date.now() })
      setEdgeId(id)
    },
    [novelId],
  )

  const autoLayout = async () => {
    await db.transaction('rw', db.entities, async () => {
      await Promise.all(visible.map((e, i) => db.entities.update(e.id, { pos: circleLayout(visible.length, i) })))
    })
    setTimeout(() => rf.fitView({ padding: 0.2, duration: 400 }), 50)
  }

  const addCharacter = async () => {
    const id = await createEntity(novelId, 'character', 'Nuevo personaje')
    const center = rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
    await db.entities.update(id, { pos: center })
    if (!types.includes('character')) setTypes([...types, 'character'])
  }

  const selectedRel = relations?.find((r) => r.id === edgeId)

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        className="border-line"
        crumbs={<span className="text-fg">Diagrama de relaciones</span>}
        actions={
          <>
            <button className="btn-ghost h-8" onClick={autoLayout} title="Reordenar en círculo">
              <LayoutGrid size={14} /> Ordenar
            </button>
            <button className="btn-primary h-8" onClick={addCharacter}>
              <Plus size={14} /> Personaje
            </button>
          </>
        }
      />
      <div className="relative flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          connectionMode={ConnectionMode.Loose}
          onNodeDragStop={(_, node) => db.entities.update(node.id, { pos: node.position })}
          onNodeClick={(_, n) => (setFocusId(focusId === n.id ? null : n.id), setEdgeId(null))}
          onNodeDoubleClick={(_, n) => navigate(`/novel/${novelId}/wiki/${n.id}`)}
          onEdgeClick={(_, e) => setEdgeId(e.id)}
          onPaneClick={() => (setFocusId(null), setEdgeId(null))}
          onNodesDelete={() => {}}
          deleteKeyCode={null}
          fitView
          fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
          minZoom={0.2}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={22} size={1.2} color="var(--border)" />
          <Controls showInteractive={false} position="bottom-right" />
          <MiniMap
            className="!hidden md:!block"
            pannable
            zoomable
            position="bottom-right"
            style={{ marginRight: 56, width: 160, height: 110 }}
            nodeColor={(n) => (n as EntityNode).data.entity.color || typeDef((n as EntityNode).data.entity.type).color}
            maskColor="color-mix(in srgb, var(--bg) 70%, transparent)"
          />

          <Panel position="top-left">
            <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-surface/90 p-1 shadow-soft backdrop-blur">
              {ENTITY_TYPES.map((t) => {
                const on = types.includes(t.type)
                return (
                  <button
                    key={t.type}
                    onClick={() => setTypes(on ? types.filter((x) => x !== t.type) : [...types, t.type])}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition',
                      on ? 'bg-hover text-fg' : 'text-subtle hover:text-fg',
                    )}
                  >
                    <t.icon size={12} style={{ color: on ? t.color : undefined }} /> {t.plural}
                  </button>
                )
              })}
            </div>
          </Panel>

          <Panel position="bottom-left">
            <div className="hidden rounded-xl border border-line bg-surface/90 p-3 text-xs shadow-soft backdrop-blur md:block">
              <div className="label mb-2">Leyenda</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {Object.entries(RELATION_KINDS).map(([k, v]) => (
                  <span key={k} className="flex items-center gap-1.5 text-muted">
                    <svg width="18" height="6">
                      <line x1="0" y1="3" x2="18" y2="3" stroke={v.color} strokeWidth="2" strokeDasharray={v.dashed ? '4 3' : undefined} />
                    </svg>
                    {v.label}
                  </span>
                ))}
              </div>
              <p className="mt-2 max-w-52 text-[11px] leading-snug text-subtle">
                Arrastra desde el punto de un personaje hasta otro para relacionarlos. Clic para resaltar, doble clic para abrir su ficha.
              </p>
            </div>
          </Panel>

          {selectedRel && (
            <Panel position="top-right">
              <RelationEditor key={selectedRel.id} relation={selectedRel} entities={entities ?? []} onClose={() => setEdgeId(null)} />
            </Panel>
          )}
        </ReactFlow>

        {visible.length === 0 && entities && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="pointer-events-auto text-center">
              <p className="text-muted">No hay elementos de los tipos seleccionados.</p>
              <button className="btn-primary mt-3" onClick={addCharacter}>
                <Plus size={14} /> Crear personaje
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function RelationEditor({ relation, entities, onClose }: { relation: Relation; entities: Entity[]; onClose: () => void }) {
  const [label, setLabel] = useState(relation.label ?? '')
  const [notes, setNotes] = useState(relation.notes ?? '')
  const name = (id: string) => entities.find((e) => e.id === id)?.name ?? '?'
  const up = (p: Partial<Relation>) => db.relations.update(relation.id, p)
  return (
    <div className="fade-in w-72 rounded-xl border border-line bg-surface p-4 shadow-soft">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="text-sm">
          <b>{name(relation.source)}</b> <span className="text-subtle">→</span> <b>{name(relation.target)}</b>
        </div>
        <button className="icon-btn h-6 w-6" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      <div className="label mb-1.5">Tipo</div>
      <div className="mb-3 flex flex-wrap gap-1">
        {(Object.keys(RELATION_KINDS) as RelationKind[]).map((k) => (
          <button
            key={k}
            onClick={() => up({ kind: k })}
            className={cn(
              'rounded-full border px-2 py-0.5 text-xs transition',
              relation.kind === k ? 'text-white' : 'border-line text-muted hover:text-fg',
            )}
            style={relation.kind === k ? { background: RELATION_KINDS[k].color, borderColor: RELATION_KINDS[k].color } : undefined}
          >
            {RELATION_KINDS[k].label}
          </button>
        ))}
      </div>
      <div className="label mb-1.5">Etiqueta</div>
      <input
        className="input mb-3"
        value={label}
        placeholder="p. ej. hermanos, le debe la vida…"
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => up({ label })}
        onKeyDown={(e) => e.key === 'Enter' && up({ label })}
      />
      <div className="label mb-1.5">Notas</div>
      <textarea
        className="input mb-3 h-20 resize-none"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => up({ notes })}
      />
      <div className="flex justify-between">
        <button className="btn-ghost h-8 px-2" onClick={() => up({ source: relation.target, target: relation.source })}>
          <ArrowLeftRight size={14} /> Invertir
        </button>
        <button
          className="btn h-8 px-2 text-red-600 hover:bg-red-500/10"
          onClick={() => {
            db.relations.delete(relation.id)
            onClose()
          }}
        >
          <Trash2 size={14} /> Eliminar
        </button>
      </div>
    </div>
  )
}
