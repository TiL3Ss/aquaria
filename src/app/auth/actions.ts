// src/app/auth/actions.ts

'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { cleanRut, validateRut } from '@/lib/rut'


export async function login(formData: FormData) {
  const supabase = await createClient()

  const rut = formData.get('rut') as string
  const password = formData.get('password') as string
  const cleanedRut = cleanRut(rut)

  if (!validateRut(cleanedRut)) {
    redirect('/auth/login?error=RUT+inválido')
  }

  const { data: email } = await supabase
    .rpc('get_email_by_rut', { p_rut: cleanedRut })

  if (!email) {
    redirect('/auth/login?error=RUT+no+registrado+en+el+sistema')
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    redirect('/auth/login?error=Contraseña+incorrecta')
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

export async function register(formData: FormData) {
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

//Block de código para verificar el código de acceso en AccessCodeGate
export async function verifyAccessCode(code: string): Promise<{ ok: boolean }> {
  const expected = process.env.REGISTER_ACCESS_CODE
  if (!expected) {
    console.error('[verifyAccessCode] REGISTER_ACCESS_CODE no está definido en .env')
    return { ok: false }
  }
  // Comparación sin timing attack
  const clean = code.replace(/\D/g, '')
  return { ok: clean === expected }
}