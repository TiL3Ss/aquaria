
// src/app/page.tsx
import { redirect } from 'next/navigation';

export default function RootPage() {
  // Aquí podrías añadir lógica, por ejemplo:
  // if (!session) redirect('/auth/login');
  
  redirect('/auth/login');

  // Este retorno nunca se ejecutará, pero es necesario para el tipado
  return null;
}