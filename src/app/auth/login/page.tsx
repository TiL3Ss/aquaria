//src/app/auth/login/page.tsx

import { login } from '../actions'
import RutInput from '@/components/ui/RutInput'
import Link from 'next/link'

interface Props {
  searchParams: Promise<{ error?: string; success?: string }>
}


export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams

  return (
    <div className="min-h-dvh bg-[#F2F2F7] flex flex-col select-none">
      <div className="flex-1 flex flex-col justify-end px-5 pb-10 pt-20">

        {/* Brand */}
        <div className="mb-8">
          <div className="w-16 h-16 bg-blue-500 rounded-[20px] flex items-center justify-center mb-5 shadow-lg shadow-blue-200">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
          </div>
          <h1 className="text-[34px] font-bold text-gray-900 tracking-tight leading-none">
            Aquaria
          </h1>
          <p className="text-[15px] text-gray-500 mt-2">
            Sistema de bitácoras operativas
          </p>
        </div>

        {/* Error alert */}
        {params.error && (
          <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 mb-4 flex items-center gap-2.5">
            <span className="w-5 h-5 rounded-full bg-red-100 text-red-500 flex items-center justify-center text-[11px] font-bold flex-shrink-0">
              !
            </span>
            <p className="text-[13px] text-red-600">
              {decodeURIComponent(params.error)}
            </p>
          </div>
        )}

        {/* Success alert (viene de /register) */}
        {params.success && (
          <div className="bg-green-50 border border-green-100 rounded-2xl px-4 py-3 mb-4 flex items-center gap-2.5">
            <span className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-[11px] font-bold flex-shrink-0">
              ✓
            </span>
            <p className="text-[13px] text-green-700">
              {decodeURIComponent(params.success)}
            </p>
          </div>
        )}

        {/* Form card */}
        <div className="bg-white rounded-3xl shadow-sm overflow-hidden">
          <form action={login} className="p-5 space-y-4">

            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-gray-400 uppercase tracking-wider px-1">
                RUT
              </label>
              <RutInput name="rut" required />
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-gray-400 uppercase tracking-wider px-1">
                Contraseña
              </label>
              <input
                type="password"
                name="password"
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="w-full px-4 py-3.5 bg-gray-50 rounded-2xl text-[15px] text-gray-900
                  placeholder-gray-400 border border-gray-100 outline-none transition-all
                  focus:bg-white focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-blue-500 active:bg-blue-600 text-white font-semibold
                text-[16px] py-4 rounded-2xl transition-colors mt-1 shadow-md shadow-blue-200"
            >
              Ingresar
            </button>

          </form>
        </div>

        <p className="text-center text-[14px] text-gray-500 mt-5">
          ¿No tienes cuenta?{' '}
          <Link href="/auth/register" className="text-blue-500 font-semibold">
            Regístrate
          </Link>
        </p>

      </div>
    </div>
  )
}