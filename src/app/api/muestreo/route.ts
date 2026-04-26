// src/app/api/muestreo/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const moduleSlug  = searchParams.get('module')
  const sessionDate = searchParams.get('date')

  if (!moduleSlug || !sessionDate) {
    return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let session: any = null

  const { data: bySlug } = await supabase
    .from('muestreo_sessions')
    .select('*')
    .eq('module_slug',  moduleSlug)
    .eq('session_date', sessionDate)
    .maybeSingle()

  if (bySlug) {
    session = bySlug
  } else {
    const { data: byDate } = await supabase
      .from('muestreo_sessions')
      .select('*')
      .eq('session_date', sessionDate)
      .eq('created_by',   user.id)
      .is('module_slug',  null)           // solo los que no tienen slug aún
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (byDate) {
      session = byDate
      await supabase
        .from('muestreo_sessions')
        .update({ module_slug: moduleSlug })
        .eq('id', byDate.id)
    }
  }

  if (!session) return NextResponse.json(null)

  // 3. Buscar estanques ordenados
  const { data: estanques } = await supabase
    .from('muestreo_estanques')
    .select('*')
    .eq('session_id', session.id)
    .order('sort_order')

  if (!estanques || estanques.length === 0) {
    return NextResponse.json({ session, estanques: [] })
  }

  // 4. Buscar filas de peces por estanque (solo peces reales, numero_pez > 0)
  const estanquesConFilas = await Promise.all(
    estanques.map(async (est: any) => {
      const { data: filas } = await supabase
        .from('muestreo_filas')
        .select('numero_pez, peso, op_izq, op_der')
        .eq('estanque_id', est.id)
        .gt('numero_pez', 0)
        .order('numero_pez')

      return {
        sort_order:      est.sort_order,
        numero_estanque: est.numero_estanque,
        fecha:           est.fecha,
        grupo:           est.grupo,
        responsable:     est.responsable,
        observaciones:   est.observaciones ?? '',
        peces:           filas ?? [],
      }
    })
  )

  return NextResponse.json({ session, estanques: estanquesConFilas })
}