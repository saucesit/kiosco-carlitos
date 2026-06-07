import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Respuesta() {
  const { id } = useParams()
  const [consulta, setConsulta] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error,    setError]    = useState(null)

  useEffect(() => {
    async function cargar() {
      const { data, error: err } = await supabase
        .from('consulta_sau')
        .select('audio_respuesta_url, nombre, created_at')
        .eq('id', id)
        .not('audio_respuesta_url', 'is', null)
        .maybeSingle()

      if (err || !data) {
        setError('Todavía no hay respuesta grabada. En breve te contactamos.')
      } else {
        setConsulta(data)
      }
      setCargando(false)
    }
    if (id) cargar()
  }, [id])

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm flex flex-col items-center gap-6 text-center">

        {/* Logo */}
        <img src="/logo.png" alt="SAU" className="w-16 h-16 rounded-2xl"
          style={{ filter: 'drop-shadow(0 0 20px rgba(0,200,120,0.5))' }} />

        {cargando ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
            <p className="text-zinc-500 text-sm">Cargando...</p>
          </div>

        ) : error ? (
          <div>
            <p className="text-4xl mb-3">⏳</p>
            <p className="text-white font-bold text-lg mb-2">Todavía no está lista</p>
            <p className="text-zinc-500 text-sm leading-relaxed">{error}</p>
            <a href="https://wa.me/543874638747?text=Hola%2C+mandé+una+consulta+en+SAU+y+quiero+hablar"
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 mt-5 bg-[#25D366]/10 text-[#25D366] font-bold text-sm px-5 py-3 rounded-full">
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12.004 2C6.477 2 2 6.477 2 12.004c0 1.77.459 3.432 1.265 4.878L2 22l5.234-1.249A9.955 9.955 0 0012.004 22C17.53 22 22 17.523 22 12.004 22 6.477 17.53 2 12.004 2z" fillRule="evenodd" clipRule="evenodd"/></svg>
              Escribinos al WhatsApp
            </a>
          </div>

        ) : (
          <>
            {/* Header */}
            <div>
              <p className="text-emerald-400 text-xs font-bold uppercase tracking-widest mb-2">SAU · Respuesta personal</p>
              <h1 className="text-white font-black text-2xl leading-tight">
                {consulta.nombre ? `Hola ${consulta.nombre.split(' ')[0]} 👋` : 'Hola! 👋'}
              </h1>
              <p className="text-zinc-400 text-sm mt-2 leading-relaxed">
                Facundo de SAU escuchó tu consulta y te grabó una respuesta.
              </p>
            </div>

            {/* Audio del response */}
            <div className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-sm">🎙️</div>
                <div>
                  <p className="text-white text-sm font-bold leading-none">Facundo · SAU</p>
                  <p className="text-zinc-600 text-[0.65rem]">{new Date(consulta.created_at).toLocaleDateString('es-AR')}</p>
                </div>
              </div>
              <audio src={consulta.audio_respuesta_url} controls className="w-full rounded-xl"
                style={{ colorScheme: 'dark' }} />
            </div>

            {/* CTA */}
            <div className="w-full grid gap-3">
              <a href="https://wa.me/543874638747?text=Escuché+tu+respuesta%2C+me+interesa+probar+SAU+gratis"
                target="_blank" rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-3 bg-emerald-500 text-white font-extrabold py-4 px-6 rounded-3xl shadow-lg shadow-emerald-900/40 active:scale-95 transition-all">
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12.004 2C6.477 2 2 6.477 2 12.004c0 1.77.459 3.432 1.265 4.878L2 22l5.234-1.249A9.955 9.955 0 0012.004 22C17.53 22 22 17.523 22 12.004 22 6.477 17.53 2 12.004 2z" fillRule="evenodd" clipRule="evenodd"/></svg>
                Quiero probar SAU gratis
              </a>
              <p className="text-zinc-700 text-xs">Primera propuesta sin cargo. Sin compromiso.</p>
            </div>

            <p className="text-zinc-800 text-xs mt-2">SAU · Sistema de Administración Unificado</p>
          </>
        )}
      </div>
    </div>
  )
}
