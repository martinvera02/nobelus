import { BookOpen, CalendarClock, Gem, MapPin, Shield, UserRound, type LucideIcon } from 'lucide-react'
import type { ChapterStatus, EntityType, RelationKind } from './db'

export interface FieldDef {
  key: string
  label: string
  placeholder?: string
  multiline?: boolean
  options?: string[]
}

export interface EntityTypeDef {
  type: EntityType
  label: string
  plural: string
  icon: LucideIcon
  emoji: string
  color: string
  fields: FieldDef[]
}

export const ENTITY_TYPES: EntityTypeDef[] = [
  {
    type: 'character',
    label: 'Personaje',
    plural: 'Personajes',
    icon: UserRound,
    emoji: '👤',
    color: '#b4532a',
    fields: [
      { key: 'role', label: 'Rol', options: ['Protagonista', 'Antagonista', 'Secundario', 'Mentor', 'Aliado', 'Figurante'] },
      { key: 'age', label: 'Edad', placeholder: '34 años' },
      { key: 'appearance', label: 'Apariencia', multiline: true, placeholder: 'Rasgos físicos, forma de vestir…' },
      { key: 'personality', label: 'Personalidad', multiline: true },
      { key: 'goal', label: 'Motivación', multiline: true, placeholder: '¿Qué quiere? ¿Qué necesita de verdad?' },
      { key: 'flaw', label: 'Defecto / herida', multiline: true },
      { key: 'arc', label: 'Arco', multiline: true, placeholder: 'Cómo cambia a lo largo de la historia' },
      { key: 'voice', label: 'Voz', placeholder: 'Muletillas, forma de hablar…' },
    ],
  },
  {
    type: 'location',
    label: 'Lugar',
    plural: 'Lugares',
    icon: MapPin,
    emoji: '📍',
    color: '#1f8a70',
    fields: [
      { key: 'kind', label: 'Tipo', options: ['Ciudad', 'Región', 'Reino', 'Edificio', 'Paraje natural', 'Planeta', 'Otro'] },
      { key: 'region', label: 'Ubicación', placeholder: 'Dentro de…' },
      { key: 'climate', label: 'Clima' },
      { key: 'population', label: 'Habitantes' },
      { key: 'senses', label: 'Sensaciones', multiline: true, placeholder: 'Olores, sonidos, luz…' },
    ],
  },
  {
    type: 'faction',
    label: 'Facción',
    plural: 'Facciones',
    icon: Shield,
    emoji: '🛡️',
    color: '#7c5cff',
    fields: [
      { key: 'leader', label: 'Líder' },
      { key: 'ideology', label: 'Ideología', multiline: true },
      { key: 'base', label: 'Sede' },
      { key: 'resources', label: 'Recursos', multiline: true },
    ],
  },
  {
    type: 'lore',
    label: 'Lore',
    plural: 'Lore',
    icon: BookOpen,
    emoji: '📜',
    color: '#a16207',
    fields: [
      {
        key: 'category',
        label: 'Categoría',
        options: ['Historia', 'Magia', 'Religión', 'Tecnología', 'Cultura', 'Idioma', 'Economía', 'Otro'],
      },
      { key: 'rules', label: 'Reglas / límites', multiline: true, placeholder: 'Qué se puede y qué no' },
    ],
  },
  {
    type: 'item',
    label: 'Objeto',
    plural: 'Objetos',
    icon: Gem,
    emoji: '🗝️',
    color: '#be185d',
    fields: [
      { key: 'owner', label: 'Portador' },
      { key: 'origin', label: 'Origen', multiline: true },
      { key: 'powers', label: 'Propiedades', multiline: true },
    ],
  },
  {
    type: 'event',
    label: 'Evento',
    plural: 'Eventos',
    icon: CalendarClock,
    emoji: '⏳',
    color: '#2563eb',
    fields: [
      { key: 'date', label: 'Fecha', placeholder: 'Año 312, invierno' },
      { key: 'place', label: 'Lugar' },
      { key: 'involved', label: 'Implicados' },
      { key: 'consequences', label: 'Consecuencias', multiline: true },
    ],
  },
]

export const typeDef = (t: EntityType) => ENTITY_TYPES.find((d) => d.type === t)!

export const STATUS: Record<ChapterStatus, { label: string; color: string }> = {
  idea: { label: 'Idea', color: '#a39a8f' },
  draft: { label: 'Borrador', color: '#d97706' },
  revision: { label: 'Revisión', color: '#2563eb' },
  final: { label: 'Final', color: '#16a34a' },
}

export const RELATION_KINDS: Record<RelationKind, { label: string; color: string; dashed?: boolean }> = {
  familia: { label: 'Familia', color: '#a16207' },
  amor: { label: 'Amor', color: '#e11d48' },
  amistad: { label: 'Amistad', color: '#16a34a' },
  alianza: { label: 'Alianza', color: '#0891b2' },
  mentor: { label: 'Mentor', color: '#7c3aed' },
  rivalidad: { label: 'Rivalidad', color: '#ea580c', dashed: true },
  enemistad: { label: 'Enemistad', color: '#dc2626', dashed: true },
  otro: { label: 'Otro', color: '#78716c' },
}
