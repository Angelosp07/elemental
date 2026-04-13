import type { SelectHTMLAttributes } from 'react'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  options: { value: string; label: string }[]
}

export function Select({ label, options, className = '', ...props }: SelectProps) {
  const selectId = props.id ?? props.name

  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <label htmlFor={selectId} className="text-xs text-gray-400 font-medium uppercase tracking-wider">
          {label}
        </label>
      ) : null}
      <select
        className={`
          bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white
          hover:border-white/20 focus:outline-none focus:ring-1 focus:ring-indigo-500
          focus:border-indigo-500 transition-colors duration-150 cursor-pointer
          ${className}
        `}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-[#1a1d24]">
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
