// src/components/ui/RutInput.tsx

'use client'

import { useState } from 'react'
import { formatRut, validateRut, cleanRut } from '@/lib/rut'

interface RutInputProps {
  name:          string
  required?:     boolean
  defaultValue?: string
}

export default function RutInput({ name, required, defaultValue = '' }: RutInputProps) {
  const [value,  setValue]  = useState(defaultValue)
  const [status, setStatus] = useState<'idle' | 'valid' | 'invalid'>('idle')

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9kK]/g, '').toUpperCase()
    if (raw.length > 9) return

    const formatted = raw.length > 1 ? formatRut(raw) : raw
    setValue(formatted)

    if (raw.length >= 7) {
      setStatus(validateRut(raw) ? 'valid' : 'invalid')
    } else {
      setStatus('idle')
    }
  }

  return (
    <div className="relative">
      {/* Input visible con formato */}
      <input
        type="text"
        name={name}
        value={value}
        onChange={handleChange}
        placeholder="12.345.678-9"
        required={required}
        inputMode="numeric"
        autoComplete="username"
        className={`w-full px-4 py-3.5 bg-gray-50 rounded-2xl text-[15px] text-gray-900
          placeholder-gray-400 border outline-none transition-all pr-16
          ${status === 'valid'
            ? 'bg-white border-green-400 ring-2 ring-green-100'
            : status === 'invalid'
            ? 'bg-white border-red-400 ring-2 ring-red-100'
            : 'border-gray-100 focus:bg-white focus:border-blue-300 focus:ring-2 focus:ring-blue-100'
          }`}
      />

      {/* Valor limpio para el Server Action (sin puntos ni guión) */}
      <input
        type="hidden"
        name={`${name}_clean`}
        value={cleanRut(value)}
      />

      {/* Badge de validación */}
      {status !== 'idle' && (
        <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold
          px-2.5 py-0.5 rounded-full pointer-events-none select-none
          ${status === 'valid'
            ? 'bg-green-100 text-green-700'
            : 'bg-red-100 text-red-600'}`}
        >
          {status === 'valid' ? '✓ OK' : '✗'}
        </span>
      )}
    </div>
  )
}