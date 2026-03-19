// src/app/auth/register/page.tsx

import { register as registerAction } from '../actions'
import RutInput from '@/components/ui/RutInput'
import Link from 'next/link'

interface Props {
  searchParams: Promise<{ error?: string }>
}

export default async function RegisterPage({ searchParams }: Props) {
  const params = await searchParams

  return (
    <div className="min-h-dvh bg-[#F2F2F7] flex flex-col select-none">
      <div className="flex-1 flex flex-col justify-end px-5 pb-10 pt-16">

        <div className="mb-7">
          <Link href="/auth/login" className="inline-flex items-center gap-1.5 text-blue-500 text-[15px] mb-5 font-medium">
            <svg width="8" height="13" viewBox="0 0 8 13" fill="none">
              <path d="M7 1L1 6.5L7 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Ingresar
          </Link>
          <h1 className="text-[28px] font-bold text-gray-900 tracking-tight">Crear cuenta</h1>
          <p className="text-[14px] text-gray-500 mt-1">Completa tus datos</p>
        </div>

        {params.error && (
          <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 mb-4 flex items-center gap-2.5">
            <span className="w-5 h-5 rounded-full bg-red-100 text-red-500 flex items-center justify-center text-[11px] font-bold flex-shrink-0">!</span>
            <p className="text-[13px] text-red-600">{decodeURIComponent(params.error)}</p>
          </div>
        )}

        <div className="bg-white rounded-3xl shadow-sm overflow-hidden">
          <form action={registerAction} className="p-5 space-y-4">

            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-gray-400 uppercase tracking-wider px-1">
                Nombre completo
              </label>
              <input
                type="text"
                name="full_name"
                placeholder="Juan Pérez González"
                required
                autoComplete="name"
                className="w-full px-4 py-3.5 bg-gray-50 rounded-2xl text-[15px] text-gray-900 placeholder-gray-400
                  border border-gray-100 outline-none focus:bg-white focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-gray-400 uppercase tracking-wider px-1">
                RUT
              </label>
              <RutInput name="rut" required />
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-gray-400 uppercase tracking-wider px-1">
                Correo electrónico
              </label>
              <input
                type="email"
                name="email"
                placeholder="juan@empresa.cl"
                required
                autoComplete="email"
                className="w-full px-4 py-3.5 bg-gray-50 rounded-2xl text-[15px] text-gray-900 placeholder-gray-400
                  border border-gray-100 outline-none focus:bg-white focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-gray-400 uppercase tracking-wider px-1">
                Contraseña
              </label>
              <input
                type="password"
                name="password"
                placeholder="Mínimo 8 caracteres"
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full px-4 py-3.5 bg-gray-50 rounded-2xl text-[15px] text-gray-900 placeholder-gray-400
                  border border-gray-100 outline-none focus:bg-white focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-blue-500 active:bg-blue-600 text-white font-semibold text-[16px]
                py-4 rounded-2xl transition-colors mt-1 shadow-md shadow-blue-200"
            >
              Crear cuenta
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}