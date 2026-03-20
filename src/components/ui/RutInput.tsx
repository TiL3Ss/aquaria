// src/components/ui/RutInput.tsx

'use client'

import { useState } from 'react'
import { formatRut, validateRut, cleanRut } from '@/lib/rut'
import {X as Xicon} from 'lucide-react'

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
      className={`w-full bg-transparent outline-none text-[15px] py-3 pr-16
        placeholder:text-gray-400
      `}
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
          {status === 'valid' ? '✓ OK' : <Xicon size={12} />}
        </span>
      )}
    </div>
  )
}