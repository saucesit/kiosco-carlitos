import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SAU_CONTEXT = `
SAU (Sistema de Administración Unificado) es una app para pymes argentinas. Sus módulos son:
- ventas: registrar ventas desde el celular, historial, totales diarios
- caja: control de efectivo, apertura y cierre de caja
- compras: registrar gastos y proveedores
- stock: inventario, alertas de stock bajo, movimientos de entrada/salida
- fiado: libretas de crédito por cliente, saldos, alertas cuando se pasa del límite
- equipo: empleados, turnos, tareas asignadas

SAU NO hace: facturación electrónica AFIP (viene después), sueldos/liquidaciones, contabilidad formal.
`

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { consulta_id } = await req.json()
    if (!consulta_id) throw new Error('Falta consulta_id')

    const OPENAI_KEY       = Deno.env.get('OPENAI_API_KEY')
    const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')
    const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!OPENAI_KEY)   throw new Error('Falta OPENAI_API_KEY')
    if (!SUPABASE_URL) throw new Error('Falta SUPABASE_URL')

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE!)

    // ── 1. Obtener la consulta ─────────────────────────────────
    const { data: consulta, error: dbErr } = await db
      .from('consulta_sau')
      .select('id, audio_url, nombre')
      .eq('id', consulta_id)
      .single()

    if (dbErr || !consulta) throw new Error('Consulta no encontrada')

    // ── 2. Descargar el audio ──────────────────────────────────
    const audioResp = await fetch(consulta.audio_url)
    if (!audioResp.ok) throw new Error(`No se pudo descargar el audio: ${audioResp.status}`)

    const audioBuffer = await audioResp.arrayBuffer()
    const audioBlob   = new Blob([audioBuffer], { type: 'audio/webm' })

    // ── 3. Transcribir con Whisper ─────────────────────────────
    const formData = new FormData()
    formData.append('file', audioBlob, 'audio.webm')
    formData.append('model', 'whisper-1')
    formData.append('language', 'es')

    const whisperResp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_KEY}` },
      body: formData,
    })

    if (!whisperResp.ok) {
      const err = await whisperResp.text()
      throw new Error(`Whisper error: ${err}`)
    }

    const { text: transcripcion } = await whisperResp.json()
    console.log('Transcripción:', transcripcion)

    // ── 4. Analizar con GPT-4o-mini ────────────────────────────
    const prompt = `${SAU_CONTEXT}

Un potencial cliente${consulta.nombre ? ` llamado ${consulta.nombre}` : ''} grabó este mensaje de voz:
"${transcripcion}"

Analizá el problema y ayudá a Facundo (dueño de SAU) a preparar su respuesta.

Respondé SOLO con JSON válido, sin markdown, con esta estructura:
{
  "problema_principal": "una oración que resume el dolor central del cliente",
  "puntos_de_dolor": ["dolor 1", "dolor 2"],
  "modulos_que_resuelven": ["modulo1", "modulo2"],
  "puede_resolver": true,
  "lo_que_no_cubrimos": null,
  "script_para_facundo": "Mensaje en primera persona como si fuera Facundo hablando. Tono argentino, cálido y directo. Empezá con empatía real ('Te entiendo', 'Sé exactamente lo que te pasa'). Mencioná el módulo específico que resuelve su problema. Invitalo a probarlo gratis. Máximo 5 oraciones."
}`

    const gptResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.6,
        max_tokens: 600,
      }),
    })

    if (!gptResp.ok) {
      const err = await gptResp.text()
      throw new Error(`GPT error: ${err}`)
    }

    const gptData = await gptResp.json()
    const analisis = JSON.parse(gptData.choices[0].message.content)
    console.log('Análisis:', analisis)

    // ── 5. Guardar en DB ───────────────────────────────────────
    const { error: updateErr } = await db
      .from('consulta_sau')
      .update({ transcripcion, analisis })
      .eq('id', consulta_id)

    if (updateErr) throw new Error(`DB update error: ${updateErr.message}`)

    return new Response(JSON.stringify({ ok: true, transcripcion, analisis }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (e) {
    console.error(e)
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
