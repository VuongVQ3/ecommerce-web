import raw from '../../../shared/cms-components.json'
import type { FieldDef } from '../author/fragments/cfApi'

/**
 * The CMS component registry (shared/cms-components.json), the same file the backend validates with: component
 * props (Content Fragment field format), defaults for a new block, which templates allow which components.
 */
export type Template = 'landing' | 'content'

/** Extra rules the registry adds to the fragment field format. */
export interface PropRules {
  ref?: 'category' | 'cfModel' | 'fragmentFolder'
  requiredWhen?: Record<string, unknown>
}

export type PropDef = FieldDef & { rules: FieldDef['rules'] & PropRules }

export interface ComponentDef {
  label: string
  props: PropDef[]
  children?: boolean
  defaults?: Record<string, unknown>
}

interface Registry {
  regions: string[]
  templates: Record<Template, { label: string; allowed: '*' | string[] }>
  pageProperties: PropDef[]
  components: Record<string, ComponentDef>
}

export const REGISTRY = raw as unknown as Registry

export const TEMPLATES = Object.entries(REGISTRY.templates).map(([key, t]) => ({ key: key as Template, label: t.label }))

export const componentDef = (type: string): ComponentDef | undefined => REGISTRY.components[type]

/** Components a template allows; inside a container, containers are left out (one level only). */
export function allowedTypes(template: Template, nested = false): string[] {
  const allowed = REGISTRY.templates[template]?.allowed ?? []
  const types = allowed === '*' ? Object.keys(REGISTRY.components) : allowed
  return types.filter((t) => REGISTRY.components[t] && !(nested && REGISTRY.components[t].children))
}

/** A block as stored in a page's content. */
export interface StoredBlock {
  id: string
  type: string
  props: Record<string, unknown>
  children?: StoredBlock[]
}

export interface PageContent {
  regions: { main: StoredBlock[] }
}

/** A new block of the type with its defaults and a fresh id. */
export function newBlock(type: string): StoredBlock {
  const def = componentDef(type)
  const block: StoredBlock = { id: `b${Math.random().toString(36).slice(2, 10)}`, type, props: { ...(def?.defaults ?? {}) } }
  if (def?.children) block.children = []
  return block
}
