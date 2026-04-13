import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export function Input({ label, error, className = '', ...props }: InputProps) {
  const inputId = props.id ?? props.name

  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <label htmlFor={inputId} className="text-xs text-gray-400 font-medium uppercase tracking-wider">
          {label}
        </label>
      ) : null}
      <input
        className={`
          bg-white/5 border rounded-lg px-3 py-2 text-sm text-white
          placeholder:text-gray-600
          focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500
          disabled:opacity-40 disabled:cursor-not-allowed
          transition-colors duration-150
          ${error ? 'border-red-500/50' : 'border-white/10 hover:border-white/20'}
          ${className}
        `}
        {...props}
      />
      {error ? <span className="text-xs text-red-400">{error}</span> : null}
    </div>
  )
}
