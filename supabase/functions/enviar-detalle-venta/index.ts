// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  console.log('🚀 Función invocada')
  
  if (req.method === 'OPTIONS') {
    console.log('✅ Petición OPTIONS')
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('📥 Parseando body...')
    const { email, detalle, pdfBase64 } = await req.json()
    
    console.log('📧 Email destino:', email)
    console.log('📋 Detalle ID:', detalle?.id?.substring(0, 8))
    console.log('📄 PDF Base64 length:', pdfBase64?.length)

    // Validar que tenemos todos los datos
    if (!email || !detalle || !pdfBase64) {
      throw new Error('Faltan datos requeridos: email, detalle o pdfBase64')
    }

    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
          .info-row { margin: 10px 0; padding: 10px; background-color: white; border-radius: 4px; }
          .label { font-weight: bold; color: #4F46E5; }
          .producto { background-color: white; padding: 10px; margin: 8px 0; border-left: 3px solid #4F46E5; border-radius: 4px; }
          .total { font-size: 1.2em; font-weight: bold; color: #4F46E5; margin-top: 15px; padding: 15px; background-color: white; border-radius: 4px; text-align: right; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Detalle de tu Compra</h1>
          </div>
          <div class="content">
            <div class="info-row"><span class="label">ID:</span> ${detalle.id.substring(0, 8)}</div>
            <div class="info-row"><span class="label">Fecha:</span> ${detalle.fecha}</div>
            <div class="info-row"><span class="label">Cliente:</span> ${detalle.cliente}</div>
            
            <h3 style="margin-top: 20px; color: #4F46E5;">Productos:</h3>
            ${detalle.productos.map(p => `
              <div class="producto">
                <strong>${p.nombre}</strong>${p.marca ? ` - ${p.marca}` : ''}<br>
                ${p.cantidad} x $${p.precio_unitario.toFixed(2)} = $${p.subtotal.toFixed(2)}
                ${p.talle ? `<br>Talle: ${p.talle}` : ''}
              </div>
            `).join('')}
            
            ${detalle.descuento > 0 ? `
              <div class="info-row">
                <span class="label">Descuento:</span> ${detalle.descuento}%
              </div>
            ` : ''}
            
            <div class="total">TOTAL: $${detalle.total.toFixed(2)}</div>
            
            <p style="text-align: center; margin-top: 20px; color: #666;">
              ¡Gracias por tu compra!<br>
              <small style="color: #999;">El recibo adjunto NO es válido como factura fiscal</small>
            </p>
          </div>
        </div>
      </body>
      </html>
    `

    console.log('🔑 Verificando API Key...')
    const apiKey = Deno.env.get('RESEND_API_KEY')
    if (!apiKey) {
      throw new Error('RESEND_API_KEY no está configurada')
    }
    console.log('✅ API Key encontrada:', apiKey.substring(0, 10) + '...')

    console.log('📤 Enviando email a Resend...')
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Tu Tienda <onboarding@resend.dev>',
        to: [email],
        subject: `Recibo de Compra - ${detalle.id.substring(0, 8)}`,
        html: htmlBody,
        attachments: [
          {
            filename: `recibo-${detalle.id.substring(0, 8)}.pdf`,
            content: pdfBase64,
          }
        ]
      })
    })

    console.log('📨 Respuesta de Resend status:', response.status)
    
    const responseData = await response.json()
    console.log('📨 Respuesta de Resend data:', JSON.stringify(responseData))

    if (!response.ok) {
      throw new Error(`Error de Resend: ${JSON.stringify(responseData)}`)
    }

    console.log('✅ Email enviado exitosamente')
    return new Response(
      JSON.stringify({ success: true, data: responseData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error('Stack:', error.stack)
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message,
        stack: error.stack 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})