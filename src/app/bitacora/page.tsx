// src/app/bitacora/page.tsx

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getLog } from '@/app/dashboard/actions'
import BitacoraClient from './BitacoraClient'
import type { Shift } from '@/types'

interface Props {
  searchParams: Promise<{
    module?: string
    date?:   string
    shift?:  string
    mode?:   string
  }>
}

export default async function BitacoraPage({ searchParams }: Props) {
  const params  = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const module = params.module ?? 'hat'
  const date   = params.date   ?? new Date().toISOString().split('T')[0]
  const shift  = (params.shift ?? 'dia') as Shift
  const mode   = (params.mode  ?? 'view') as 'view' | 'create'

  const logFull = mode !== 'create' ? await getLog(module, date, shift) : null

  return (
    <BitacoraClient
      logFull={logFull}
      module={module}
      date={date}
      shift={shift}
      mode={mode}
      operatorName={profile?.full_name ?? ''}
    />
  )
}