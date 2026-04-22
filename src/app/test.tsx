import { createClient } from '@/lib/supabase/server'

export default async function TestServer() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('logs')
    .select('*')
    .limit(1)

  console.log('SERVER DATA:', data)
  console.log('SERVER ERROR:', error)

  return <div>Check server console</div>
}