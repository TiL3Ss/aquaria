// src/app/auth/register/page.tsx

import { register as registerAction } from '../actions'
import RutInput from '@/components/ui/RutInput'
import Link from 'next/link'
import { AlertCircle, UserPlus, ChevronLeft } from 'lucide-react'

interface Props {
  searchParams: Promise<{ error?: string }>
}

export default async function RegisterPage({ searchParams }: Props) {
  const params = await searchParams

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 bg-[#f2f2f7]">

      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 w-[76px] h-[76px] rounded-[22px] flex items-center justify-center bg-black/90">
            <UserPlus size={30} className="text-white" />
          </div>

          <h1 className="text-3xl font-semibold tracking-tight text-black">
            Crear cuenta
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Completa tus datos para registrarte
          </p>
        </div>

        {/* Alerta */}
        {params.error && (
          <div className="mb-4 flex items-start gap-2 px-4 py-3 rounded-2xl
            bg-red-50/80 backdrop-blur-md border border-red-100 shadow-sm">
            <AlertCircle size={16} className="text-red-500 mt-[2px] flex-shrink-0" />
            <p className="text-[13px] text-red-600 leading-snug">
              {decodeURIComponent(params.error)}
            </p>
          </div>
        )}

        {/* Card */}
        <div className="bg-white rounded-[32px] shadow-sm border border-gray-200">
          <form action={registerAction} className="p-6 space-y-5">

            {/* Nombre */}
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 block">
                Nombre completo
              </label>
              <input
                type="text"
                name="full_name"
                placeholder="Nombre Completo"
                required
                autoComplete="name"
                className="w-full px-4 py-3 text-[15px] rounded-full bg-[#f2f2f7] outline-none focus:ring-2 focus:ring-black/10 transition placeholder-gray-400 text-gray-900"
              />
            </div>

            {/* RUT */}
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 block">
                RUT
              </label>
              <div className="bg-[#f2f2f7] rounded-full px-4 focus-within:ring-2 focus-within:ring-black/10 transition">
                <RutInput name="rut" required />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 block">
                Correo electrónico
              </label>
              <input
                type="email"
                name="email"
                placeholder="nombre@empresa.cl"
                required
                autoComplete="email"
                className="w-full px-4 py-3 text-[15px] rounded-full bg-[#f2f2f7] outline-none focus:ring-2 focus:ring-black/10 transition placeholder-gray-400 text-gray-900"
              />
            </div>

            {/* Contraseña */}
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 block">
                Contraseña
              </label>
              <input
                type="password"
                name="password"
                placeholder="Mínimo 8 caracteres"
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full px-4 py-3 text-[15px] rounded-full bg-[#f2f2f7] outline-none focus:ring-2 focus:ring-black/10 transition placeholder-gray-400 text-gray-900"
              />
            </div>

            {/* Botón */}
            <button
              type="submit"
              className="cursor-pointer w-full py-3 rounded-full text-white font-semibold text-[15px] bg-black active:scale-[0.97] transition"
            >
              Crear cuenta
            </button>

          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-gray-500 mt-6 flex items-center justify-center gap-1">
          <ChevronLeft size={14} className="text-gray-400" />
          <Link href="/auth/login" className="font-semibold text-black">
            Volver a iniciar sesión
          </Link>
        </p>

      </div>
    </div>
  )
}