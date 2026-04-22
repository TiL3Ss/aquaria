// src/app/bodega/page.tsx
import { redirect }        from 'next/navigation'
import { createClient }    from '@/utils/supabase/server'
import BodegaClient        from './BodegaClient'
import {
  getBodegaConfig,
  getCargoTypes,
  getBodegaProducts,
  getBodegaHistory,
} from './actions'

export default async function BodegaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles').select('id, full_name, role').eq('id', user.id).single()
  if (!profile) redirect('/auth/login')

  const [config, cargoTypes, products, history, modulesRes] = await Promise.all([
    getBodegaConfig(),
    getCargoTypes(),
    getBodegaProducts(),
    getBodegaHistory(),
    supabase.from('modules').select('id, name, slug').eq('active', true).order('name'),
  ])

  return (
    <BodegaClient
      profile={profile}
      initialConfig={config}
      initialCargoTypes={cargoTypes}
      initialProducts={products}
      initialHistory={history}
      dbModules={modulesRes.data ?? []}
    />
  )
}