// src/app/dashboard/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardClient from './DashboardClient'

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, rut, full_name, email, role, created_at')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/auth/login')

  // Carga los módulos desde la BD para mantenerlos sincronizados
  const { data: modules } = await supabase
    .from('modules')
    .select('id, name, slug')
    .eq('active', true)
    .order('name')

  return <DashboardClient profile={profile} dbModules={modules ?? []} />
}