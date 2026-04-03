// src/app/auth/forgot-password/page.tsx
'use client'

import { forgotPassword } from '../actions'
import RutInput from '@/components/ui/RutInput'
import Image from "next/image"
import libro from "@/IMG/librob.png"
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

export default function ForgotPasswordPage() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')
  const success = searchParams.get('success')

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 bg-[#f2f2f7]">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 w-[76px] h-[76px] rounded-[22px] flex items-center justify-center bg-black/90 overflow-hidden">
            <Image src={libro} alt="Icono" width={40} height={40} className="object-contain" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-black">Aquaria</h1>
          <p className="text-sm text-gray-500 mt-1">Restablecer contraseña</p>
        </div>

        {/* Alertas */}
        {(error || success) && (
          <div className="mb-4 space-y-2">
            {error && (
              <div className="flex items-start gap-2 px-4 py-3 rounded-2xl bg-red-50/80 backdrop-blur-md border border-red-100 shadow-sm">
                <AlertCircle size={16} className="text-red-500 mt-[2px]" />
                <p className="text-[13px] text-red-600 leading-snug">{decodeURIComponent(error)}</p>
              </div>
            )}
            {success && (
              <div className="flex items-start gap-2 px-4 py-3 rounded-2xl bg-gray-50/80 backdrop-blur-md border border-gray-200 shadow-sm">
                <CheckCircle2 size={16} className="text-gray-900 mt-[2px]" />
                <p className="text-[13px] text-gray-800 leading-snug">{decodeURIComponent(success)}</p>
              </div>
            )}
          </div>
        )}

        {/* Card */}
        <div className="bg-white rounded-[32px] shadow-sm border border-gray-200">
          <form action={forgotPassword} className="p-6 space-y-5">
            <p className="text-[13px] text-gray-500 leading-snug">
              Ingresa tu RUT y te enviaremos un correo para restablecer tu contraseña.
            </p>

            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 block">
                RUT
              </label>
              <div className="bg-[#f2f2f7] rounded-full px-4 focus-within:ring-2 focus-within:ring-black/10 transition">
                <RutInput name="rut" required />
              </div>
            </div>

            <button
              type="submit"
              className="cursor-pointer w-full py-3 rounded-full text-white font-semibold text-[15px] bg-black active:scale-[0.97] transition"
            >
              Enviar correo
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          <Link href="/auth/login" className="text-black font-medium hover:underline">
            Volver al inicio de sesión
          </Link>
        </p>
      </div>
    </div>
  )
}
