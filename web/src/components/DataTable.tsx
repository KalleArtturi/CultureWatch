import { useMemo, useState, type ReactNode } from 'react'

export interface Column<T> {
  key: string
  header: ReactNode
  render: (row: T) => ReactNode
  /** value used for sorting; omit to make the column unsortable */
  sort?: (row: T) => number | string | null | undefined
  numeric?: boolean
  title?: string
}

export function DataTable<T>({ rows, columns, rowKey, initialSort, highlight, empty = 'No rows.' }: {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  initialSort?: { key: string; desc?: boolean }
  highlight?: (row: T) => boolean
  empty?: string
}) {
  const [sort, setSort] = useState(initialSort)

  const sorted = useMemo(() => {
    const col = columns.find(c => c.key === sort?.key)
    if (!col?.sort) return rows
    const get = col.sort
    const dir = sort?.desc ? -1 : 1
    return [...rows].sort((a, b) => {
      const va = get(a), vb = get(b)
      if (va === null || va === undefined) return 1 // missing values always last
      if (vb === null || vb === undefined) return -1
      return (va < vb ? -1 : va > vb ? 1 : 0) * dir
    })
  }, [rows, columns, sort])

  if (!rows.length) return <p className="muted">{empty}</p>

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map(c => {
              const active = sort?.key === c.key
              return (
                <th
                  key={c.key}
                  className={`${c.numeric ? 'r ' : ''}${c.sort ? 'sortable' : ''}`}
                  title={c.title}
                  aria-sort={active ? (sort?.desc ? 'descending' : 'ascending') : undefined}
                  onClick={c.sort ? () => setSort({ key: c.key, desc: active ? !sort?.desc : !!c.numeric }) : undefined}
                >
                  {c.header}
                  {active ? (sort?.desc ? ' ↓' : ' ↑') : ''}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map(r => (
            <tr key={rowKey(r)} className={highlight?.(r) ? 'highlight' : undefined}>
              {columns.map(c => (
                <td key={c.key} className={c.numeric ? 'r' : undefined}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
