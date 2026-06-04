export type PresentationScalar = boolean | number | string | null

export type PresentationTableColumn = {
  key: string
  label: string
  type?: 'number' | 'string' | 'url'
}

export type PresentationTable = {
  id: string
  title: string
  columns: PresentationTableColumn[]
  rows: Array<Record<string, PresentationScalar>>
}

export type PresentationChart = {
  id: string
  title: string
  type: 'bar'
  tableId: string
  xKey: string
  yKey: string
}

export type Presentation = {
  tables: PresentationTable[]
  charts: PresentationChart[]
}
