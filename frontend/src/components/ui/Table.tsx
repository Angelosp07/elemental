import type { ReactNode } from 'react'

interface Column<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  align?: 'left' | 'right' | 'center'
}

interface TableProps<T> {
  columns: Column<T>[]
  data: T[]
  emptyMessage?: string
  getRowKey?: (row: T, index: number) => string
  rowClassName?: (row: T, index: number) => string
}

export function Table<T>({
  columns,
  data,
  emptyMessage = 'No data',
  getRowKey,
  rowClassName,
}: TableProps<T>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-white/[0.08]">
            {columns.map((column) => (
              <th
                key={column.key}
                className={`pb-3 text-xs text-gray-500 uppercase tracking-wider font-medium ${
                  column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left'
                }`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="py-8 text-center text-sm text-gray-600">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, index) => (
              <tr
                key={getRowKey ? getRowKey(row, index) : String(index)}
                className={`border-b border-white/5 hover:bg-white/[0.02] transition-colors ${
                  rowClassName ? rowClassName(row, index) : ''
                }`}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`py-3 text-sm text-gray-200 ${
                      column.align === 'right'
                        ? 'text-right'
                        : column.align === 'center'
                          ? 'text-center'
                          : 'text-left'
                    }`}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
