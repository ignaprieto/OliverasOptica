import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    // Crear cliente de Supabase con service_role
    const supabaseClient = createClient(
      Deno.env.get('https://assxtodownkrsutcmsar.supabase.co') ?? '',
      Deno.env.get('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzc3h0b2Rvd25rcnN1dGNtc2FyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1ODc1NDg1OSwiZXhwIjoyMDc0MzMwODU5fQ.Jh2h5j1MrpFT5TOUgD3m4laQCGNsIXMxchtL5SU6M9o') ?? ''
    )

    // Ejecutar función de cierre automático
    const { data, error } = await supabaseClient
      .rpc('cierre_automatico_caja')

    if (error) throw error

    console.log('Resultado cierre automático:', data)

    return new Response(
      JSON.stringify({ 
        success: true, 
        resultado: data,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (error) {
    console.error('Error en cierre automático:', error)
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      }
    )
  }
})