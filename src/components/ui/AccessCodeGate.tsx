// src/components/ui/AccessCodeGate.tsx

'use client'

import { useState, useRef, useEffect, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { verifyAccessCode } from '@/app/auth/actions'

interface Props {
  children: React.ReactNode
}

export default function AccessCodeGate({ children }: Props) {
  const router = useRouter()

  const [unlocked,  setUnlocked]  = useState(false)
  const [digits,    setDigits]    = useState<string[]>(Array(6).fill(''))
  const [error,     setError]     = useState(false)
  const [shaking,   setShaking]   = useState(false)
  const [checking,  setChecking]  = useState(false)

  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Foco en el primer input al montar
  useEffect(() => {
    inputRefs.current[0]?.focus()
  }, [])

  // Auto-submit cuando los 6 dígitos están completos
  useEffect(() => {
    if (digits.every(d => d !== '')) handleSubmit()
  }, [digits]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleChange(i: number, value: string) {
    // Acepta solo un dígito numérico
    const digit = value.replace(/\D/g, '').slice(-1)
    const next  = [...digits]
    next[i]     = digit
    setDigits(next)
    setError(false)

    // Avanzar al siguiente input
    if (digit && i < 5) {
      inputRefs.current[i + 1]?.focus()
    }
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      if (digits[i]) {
        const next = [...digits]
        next[i] = ''
        setDigits(next)
      } else if (i > 0) {
        inputRefs.current[i - 1]?.focus()
        const next = [...digits]
        next[i - 1] = ''
        setDigits(next)
      }
    }
    if (e.key === 'ArrowLeft'  && i > 0) inputRefs.current[i - 1]?.focus()
    if (e.key === 'ArrowRight' && i < 5) inputRefs.current[i + 1]?.focus()
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    const next = Array(6).fill('')
    pasted.split('').forEach((d, i) => { next[i] = d })
    setDigits(next)
    // Foco en el último dígito pegado
    const lastIdx = Math.min(pasted.length, 5)
    inputRefs.current[lastIdx]?.focus()
  }

  async function handleSubmit() {
    if (checking) return
    const code = digits.join('')
    if (code.length < 6) return

    setChecking(true)
    const { ok } = await verifyAccessCode(code)
    setChecking(false)

    if (ok) {
      setUnlocked(true)
    } else {
      // Animar shake y limpiar
      setError(true)
      setShaking(true)
      setTimeout(() => {
        setShaking(false)
        setDigits(Array(6).fill(''))
        inputRefs.current[0]?.focus()
      }, 600)
      setTimeout(() => router.push('/'), 1500)
    }
  }

  // Si ya está desbloqueado, mostrar el contenido
  if (unlocked) return <>{children}</>

  return (
    <>
      {/* Contenido desenfocado detrás */}
      <div className="pointer-events-none select-none filter blur-sm brightness-75 fixed inset-0 z-0 overflow-hidden">
        {children}
      </div>

      {/* Overlay */}
      <div className="fixed inset-0 z-50 flex items-center justify-center px-6"
        style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>

        {/* Modal */}
        <div className={`w-full max-w-sm bg-white rounded-[32px] shadow-2xl overflow-hidden
          transition-transform duration-150
          ${shaking ? 'animate-shake' : ''}`}>

          {/* Header */}
          <div className="flex flex-col items-center pt-8 pb-5 px-6 gap-3">
            <div className="w-16 h-16 rounded-[20px] bg-black/90 flex items-center justify-center shadow-lg">
              <ShieldAlert size={28} className="text-white" />
            </div>
            <div className="text-center">
              <h2 className="text-[20px] font-bold text-gray-900 leading-tight">Acceso restringido</h2>
              <p className="text-[13px] text-gray-400 mt-1 leading-snug">
                Ingresa el código de 6 dígitos<br />para continuar
              </p>
            </div>
          </div>

          {/* Inputs */}
          <div className="px-6 pb-2">
            <div className="flex items-center justify-center gap-2" onPaste={handlePaste}>
              {Array.from({ length: 6 }).map((_, i) => (
                <Fragment key={i}>
                  {i === 3 && (
                    <span className="text-[20px] font-light text-gray-300 select-none mx-0.5">—</span>
                  )}
                  <input
                    ref={el => { inputRefs.current[i] = el }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    value={digits[i]}
                    onChange={e => handleChange(i, e.target.value)}
                    onKeyDown={e => handleKeyDown(i, e)}
                    disabled={checking}
                    className={`w-11 h-14 text-center text-[22px] font-bold rounded-2xl outline-none transition-all
                      caret-transparent select-none
                      ${error
                        ? 'bg-red-50 border-2 border-red-300 text-red-500'
                        : digits[i]
                          ? 'bg-gray-900 border-2 border-gray-900 text-white'
                          : 'bg-[#f2f2f7] border-2 border-transparent text-gray-900 focus:border-gray-300'
                      }
                      disabled:opacity-60`}
                  />
                </Fragment>
              ))}
            </div>

            {/* Mensaje de error */}
            <div className={`flex items-center justify-center gap-1.5 mt-3 transition-opacity duration-200
              ${error ? 'opacity-100' : 'opacity-0'}`}>
              <span className="text-[13px] text-red-500 font-medium">Código incorrecto</span>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 pt-2 pb-8">
            <button
              onClick={handleSubmit}
              disabled={digits.some(d => d === '') || checking}
              className="w-full py-3.5 rounded-full bg-black text-white text-[15px] font-semibold
                active:scale-[0.97] transition-all disabled:opacity-30 disabled:cursor-not-allowed">
              {checking ? 'Verificando…' : 'Continuar'}
            </button>
          </div>
        </div>
      </div>

      {/* Keyframe shake — inyectado inline para no depender de tailwind config */}
      <style>{`
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          15%      { transform: translateX(-8px); }
          30%      { transform: translateX(8px); }
          45%      { transform: translateX(-6px); }
          60%      { transform: translateX(6px); }
          75%      { transform: translateX(-3px); }
          90%      { transform: translateX(3px); }
        }
        .animate-shake { animation: shake 0.6s ease-in-out; }
      `}</style>
    </>
  )
}