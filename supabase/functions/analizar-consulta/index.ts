import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SAU_MODULOS = `
- ventas: registrar ventas desde el celular, historial, totales
- caja: control de efectivo, apertura/cierre
- compras: registrar gastos y proveedores
- stock: inventario, alertas de stock bajo
- fiado: crédito por cliente, saldos, alertas de límite
- equipo: empleados, turnos, tareas
`

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { consulta_id } = await req.json()
    if (!consulta_id) throw new Error('Falta consulta_id')

    const GEMINI_KEY    = Deno.env.get('GEMINI_API_KEY')
    const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')
    const SUPABASE_SVC  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!GEMINI_KEY) throw new Error('Falta GEMINI_API_KEY — configurala en Supabase Secrets')

    const db = createClient(SUPABASE_URL!, SUPABASE_SVC!)

    // ── 1. Obtener consulta ────────────────────────────────────
    const { data: consulta, error: dbErr } = await db
      .from('consulta_sau')
      .select('id, audio_url, nombre')
      .eq('id', consulta_id)
      .single()

    if (dbErr || !consulta) throw new Error('Consulta no encontrada')

    // ── 2. Descargar audio ─────────────────────────────────────
    const audioResp = await fetch(consulta.audio_url)
    if (!audioResp.ok) throw new Error(`No se pudo descargar el audio (${audioResp.status})`)

    const audioBuffer = await audioResp.arrayBuffer()

    // Convertir a base64 en chunks para evitar stack overflow
    const bytes  = new Uint8Array(audioBuffer)
    const chunk  = 8192
    let base64   = ''
    for (let i = 0; i < bytes.length; i += chunk) {
      base64 += String.fromCharCode(...bytes.subarray(i, i + chunk))
    }
    base64 = btoa(base64)

    // Detectar mime type por extensión de la URL
    const url      = consulta.audio_url.toLowerCase()
    const mimeType = url.includes('.mp4') || url.includes('.m4a')
      ? 'audio/mp4'
      : url.includes('.ogg')
      ? 'audio/ogg'
      : 'audio/webm'

    // ── 3. Llamar a Gemini Flash (transcribe + analiza en un solo paso) ──
    const prompt = `Sos el asistente de Facundo, dueño de SAU (Sistema de Administración Unificado), una app de gestión para pymes argentinas.

Los módulos de SAU son:${SAU_MODULOS}
SAU NO hace todavía: facturación electrónica AFIP, liquidación de sueldos.

En el audio${consulta.nombre ? ` habla ${consulta.nombre},` : ''} un potencial cliente que se está quejando de sus problemas de gestión del negocio.

Tu tarea:
1. Transcribí exactamente lo que dice
2. Analizá su problema
3. Identificá qué módulos de SAU lo resuelven
4. Escribí un script corto para que Facundo grabe su respuesta de audio

Respondé SOLO con JSON válido (sin markdown, sin \`\`\`):
{
  "transcripcion": "texto completo de lo que dijo",
  "problema_principal": "una oración que resume el dolor central",
  "puntos_de_dolor": ["dolor concreto 1", "dolor concreto 2"],
  "modulos_que_resuelven": ["nombre_modulo1", "nombre_modulo2"],
  "puede_resolver": true,
  "lo_que_no_cubrimos": null,
  "script_para_facundo": "Mensaje en primera persona como si fuera Facundo hablando. Tono argentino, cálido y directo. Empezá con empatía genuina (Te entiendo, Sé exactamente lo que te pasa, etc). Mencioná el módulo específico de SAU que resuelve su problema. Terminá invitándolo a probarlo gratis sin compromiso. Máximo 5 oraciones cortas."
}`

    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: base64 } },
            ],
          }],
          generationConfig: {
            temperature: 0.6,
            maxOutputTokens: 900,
          },
        }),
      }
    )

    if (!geminiResp.ok) {
      const err = await geminiResp.text()
      throw new Error(`Gemini error ${geminiResp.status}: ${err}`)
    }

    const geminiData = await geminiResp.json()
    const rawText    = geminiData.candidates?.[0]?.content?.parts?.[0]?.text

    if (!rawText) throw new Error('Gemini no devolvió texto')

    // Limpiar posible markdown en la respuesta
    const clean    = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
    const resultado = JSON.parse(clean)

    const { transcripcion, ...analisis } = resultado

    // ── 4. Guardar en DB ───────────────────────────────────────
    const { error: updateErr } = await db
      .from('consulta_sau')
      .update({ transcripcion, analisis })
      .eq('id', consulta_id)

    if (updateErr) throw new Error(`DB error: ${updateErr.message}`)

    console.log(`✅ Consulta ${consulta_id} analizada correctamente`)

    return new Response(JSON.stringify({ ok: true, transcripcion, analisis }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (e) {
    console.error('Error en analizar-consulta:', e)
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
