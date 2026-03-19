// src/app/auth/actions.ts

'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { cleanRut, validateRut } from '@/lib/rut'

export async function login( formData: FormData) {
  const supabase = await createClient()

  const rut = formData.get('rut') as string
  const password = formData.get('password') as string

  const cleanedRut = cleanRut(rut)
  if (!validateRut(cleanedRut)) {
    redirect('/auth/login?error=RUT+inválido')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('email')
    .eq('rut', cleanedRut)
    .single()

  if (!profile) {
    redirect('/auth/login?error=RUT+no+registrado+en+el+sistema')
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: profile.email,
    password,
  })

  if (error) {
    redirect('/auth/login?error=Contraseña+incorrecta')
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

export async function register(_: unknown, formData: FormData) {
  const supabase = await createClient()

  const fullName = (formData.get('full_name') as string)?.trim()
  const rut = formData.get('rut') as string
  const email = (formData.get('email') as string)?.trim()
  const password = formData.get('password') as string
  const cleanedRut = cleanRut(rut)

  if (!validateRut(cleanedRut)) redirect('/auth/register?error=RUT+inválido')
  if (!fullName) redirect('/auth/register?error=El+nombre+es+obligatorio')
  if (!email || !email.includes('@')) redirect('/auth/register?error=Correo+inválido')
  if (password.length < 8) redirect('/auth/register?error=Contraseña+mínimo+8+caracteres')

  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('rut', cleanedRut)
    .maybeSingle()

  if (existing) redirect('/auth/register?error=Este+RUT+ya+está+registrado')

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, rut: cleanedRut } },
  })

  if (error) redirect(`/auth/register?error=${encodeURIComponent(error.message)}`)

  redirect('/auth/login?success=Cuenta+creada.+Revisa+tu+correo+para+confirmar.')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/auth/login')
}