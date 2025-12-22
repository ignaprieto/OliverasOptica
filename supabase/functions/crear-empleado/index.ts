// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 1. Manejo de CORS (Permitir peticiones desde tu Angular)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { nombre, dni, email, password } = await req.json()

    // 2. Cliente Admin (Service Role) - Este tiene permiso para TODO
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 3. Crear usuario usando la API oficial (Genera identities, tokens, etc. correctamente)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true, // Auto-confirmar
      user_metadata: { nombre: nombre, rol: 'vendedor' }
    })

    if (authError) throw authError

    if (!authData.user) throw new Error('No se pudo crear el usuario');

    // 4. Crear el perfil en la tabla vendedores (Vinculado)
    const { data: vendedor, error: dbError } = await supabaseAdmin
      .from('vendedores')
      .insert({
        nombre: nombre,
        dni: dni,
        usuario_id: authData.user.id,
        activo: true
      })
      .select()
      .single()

    if (dbError) {
      // Si falla la BD, borramos el usuario Auth para no dejar basura
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      throw dbError
    }

    // 5. Asignar permisos iniciales
    await supabaseAdmin.from('permisos_empleado').insert({
        empleado_id: vendedor.id,
        vista: 'ventas',
        puede_ver: true,
        puede_crear: true,
        puede_editar: false,
        puede_eliminar: false
    })

    return new Response(
      JSON.stringify({ success: true, data: vendedor }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})