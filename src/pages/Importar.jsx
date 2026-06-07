import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// ── Parser CSV simple ─────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return { headers: [], rows: [] }
  const sep     = lines[0].includes(';') ? ';' : ','
  const clean   = v => v.trim().replace(/^["']|["']$/g, '')
  const headers = lines[0].split(sep).map(clean)
  const rows    = lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = line.split(sep).map(clean)
    const obj  = {}
    headers.forEach((h, i) => { obj[h] = vals[i] ?? '' })
    return obj
  })
  return { headers, rows }
}

// ── Genera y descarga CSV ─────────────────────────────────────────
function descargarPlantilla(headers, ejemplo, filename) {
  const csv  = [headers.join(','), ejemplo.join(',')].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ── Definición de importaciones ───────────────────────────────────
const TIPOS = {
  productos: {
    emoji:       '📦',
    titulo:      'Productos',
    descripcion: 'Catálogo completo con precios y stock inicial',
    tabla:       'producto',
    headers:     ['nombre', 'descripcion', 'precio_venta', 'precio_costo', 'stock_actual', 'stock_minimo'],
    ejemplo:     ['Coca Cola 500ml', 'Gaseosa fría', '1200', '800', '48', '12'],
    filename:    'sau_plantilla_productos.csv',
    mapear: (row, empresa_id) => ({
      empresa_id,
      nombre:       row.nombre                              || '',
      descripcion:  row.descripcion                         || null,
      precio_venta: parseFloat(row.precio_venta)            || 0,
      precio_costo: parseFloat(row.precio_costo)            || null,
      stock_actual: parseFloat(row.stock_actual)            || 0,
      stock_minimo: parseFloat(row.stock_minimo)            || 0,
      activo:       true,
    }),
    validar: row => !!row.nombre?.trim(),
  },
  fiado: {
    emoji:       '📒',
    titulo:      'Clientes Fiado',
    descripcion: 'Libretas de crédito con saldos actuales',
    tabla:       'cliente_fiado',
    headers:     ['nombre', 'telefono', 'saldo_actual', 'limite_credito', 'notas'],
    ejemplo:     ['Juan Pérez', '3874123456', '5000', '20000', 'Cliente habitual'],
    filename:    'sau_plantilla_fiado.csv',
    mapear: (row, empresa_id) => ({
      empresa_id,
      nombre:         row.nombre                              || '',
      telefono:       row.telefono                            || null,
      saldo_actual:   parseFloat(row.saldo_actual)            || 0,
      limite_credito: row.limite_credito ? parseFloat(row.limite_credito) : null,
      notas:          row.notas                               || null,
      estado:         (parseFloat(row.saldo_actual) || 0) > 0 ? 'debe' : 'dia',
    }),
    validar: row => !!row.nombre?.trim(),
  },
  ventas: {
    emoji:       '💰',
    titulo:      'Ventas históricas',
    descripcion: 'Historial de ventas de otro sistema',
    tabla:       'venta',
    headers:     ['fecha', 'total', 'forma_pago', 'descripcion'],
    ejemplo:     ['2025-01-15', '8500', 'efectivo', 'Venta mostrador'],
    filename:    'sau_plantilla_ventas.csv',
    mapear: (row, empresa_id) => ({
      empresa_id,
      total:        parseFloat(row.total)    || 0,
      forma_pago:   row.forma_pago           || 'efectivo',
      descripcion:  row.descripcion          || 'Importado',
      created_at:   row.fecha ? new Date(row.fecha).toISOString() : new Date().toISOString(),
    }),
    validar: row => !!row.total && !isNaN(parseFloat(row.total)),
  },
}

// ── Card de tipo de importación ───────────────────────────────────
function TipoCard({ id, tipo, empresaId, onImportado }) {
  const [fase,      setFase]      = useState('idle') // idle | preview | importando | done
  const [filas,     setFilas]     = useState([])
  const [errores,   setErrores]   = useState([])
  const [importados,setImportados]= useState(0)
  const inputRef = useRef()

  function onArchivo(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const { rows } = parseCSV(ev.target.result)
      const validas   = rows.filter(r => tipo.validar(r))
      const invalidas = rows.filter(r => !tipo.validar(r))
      setFilas(validas)
      setErrores(invalidas)
      setFase('preview')
    }
    reader.readAsText(file, 'UTF-8')
  }

  async function confirmarImport() {
    if (!filas.length) return
    setFase('importando')
    const registros = filas.map(r => tipo.mapear(r, empresaId))

    // Insertar en lotes de 100
    let ok = 0
    for (let i = 0; i < registros.length; i += 100) {
      const lote = registros.slice(i, i + 100)
      const { error } = await supabase.from(tipo.tabla).insert(lote)
      if (!error) ok += lote.length
    }

    setImportados(ok)
    setFase('done')
    onImportado(id, ok)
  }

  function reset() {
    setFase('idle'); setFilas([]); setErrores([]); setImportados(0)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="bg-white border border-zinc-200 rounded-3xl overflow-hidden shadow-sm">

      {/* Header */}
      <div className="px-5 py-4 flex items-center gap-3 border-b border-zinc-100">
        <span className="text-3xl">{tipo.emoji}</span>
        <div>
          <h3 className="font-extrabold text-zinc-900">{tipo.titulo}</h3>
          <p className="text-zinc-500 text-xs">{tipo.descripcion}</p>
        </div>
      </div>

      <div className="px-5 py-4 grid gap-3">

        {/* Plantilla */}
        <div className="bg-zinc-50 rounded-2xl px-4 py-3">
          <p className="text-xs text-zinc-500 font-semibold uppercase tracking-widest mb-2">1. Descargá la plantilla</p>
          <p className="text-zinc-600 text-xs mb-3 leading-snug">
            Completá la plantilla con tus datos. Si venís de otro sistema, exportá a Excel y pegá las columnas.
          </p>
          <div className="bg-zinc-100 rounded-xl px-3 py-2 font-mono text-[0.65rem] text-zinc-500 mb-3 overflow-x-auto">
            {tipo.headers.join(' | ')}
          </div>
          <button
            onClick={() => descargarPlantilla(tipo.headers, tipo.ejemplo, tipo.filename)}
            className="flex items-center gap-2 bg-zinc-900 text-white text-xs font-bold px-4 py-2 rounded-full active:scale-95 transition-all">
            ⬇️ Descargar plantilla CSV
          </button>
        </div>

        {/* Upload */}
        {fase === 'idle' && (
          <div>
            <p className="text-xs text-zinc-500 font-semibold uppercase tracking-widest mb-2">2. Subí tu archivo</p>
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-zinc-300 rounded-2xl py-6 cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition-all">
              <span className="text-2xl">📂</span>
              <span className="text-zinc-500 text-sm font-semibold">Tocá para subir tu CSV</span>
              <span className="text-zinc-400 text-xs">También podés arrastrar el archivo</span>
              <input ref={inputRef} type="file" accept=".csv,.txt" className="hidden" onChange={onArchivo} />
            </label>
          </div>
        )}

        {/* Preview */}
        {fase === 'preview' && (
          <div className="grid gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-500 font-semibold uppercase tracking-widest">Vista previa</p>
              <button onClick={reset} className="text-xs text-zinc-400">Cambiar archivo</button>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 flex items-center gap-3">
              <span className="text-2xl">✅</span>
              <div>
                <p className="font-extrabold text-emerald-800">{filas.length} registros listos</p>
                {errores.length > 0 && (
                  <p className="text-amber-600 text-xs">{errores.length} filas ignoradas (falta nombre o dato requerido)</p>
                )}
              </div>
            </div>

            {/* Tabla preview */}
            <div className="overflow-x-auto rounded-2xl border border-zinc-200">
              <table className="w-full text-xs">
                <thead className="bg-zinc-50">
                  <tr>
                    {tipo.headers.map(h => (
                      <th key={h} className="px-3 py-2 text-left font-bold text-zinc-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filas.slice(0, 5).map((f, i) => (
                    <tr key={i} className="border-t border-zinc-100">
                      {tipo.headers.map(h => (
                        <td key={h} className="px-3 py-2 text-zinc-700 truncate max-w-[120px]">{f[h] || '—'}</td>
                      ))}
                    </tr>
                  ))}
                  {filas.length > 5 && (
                    <tr className="border-t border-zinc-100 bg-zinc-50">
                      <td colSpan={tipo.headers.length} className="px-3 py-2 text-zinc-400 text-center">
                        ... y {filas.length - 5} más
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <button onClick={confirmarImport}
              className="w-full py-4 rounded-3xl bg-emerald-500 text-white font-extrabold text-base active:scale-95 transition-all shadow-lg shadow-emerald-200">
              Importar {filas.length} {tipo.titulo.toLowerCase()} →
            </button>
          </div>
        )}

        {/* Importando */}
        {fase === 'importando' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="w-10 h-10 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" />
            <p className="text-zinc-500 font-semibold">Importando datos...</p>
          </div>
        )}

        {/* Done */}
        {fase === 'done' && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-4 flex items-center gap-3">
            <span className="text-3xl">🎉</span>
            <div>
              <p className="font-extrabold text-emerald-800">{importados} {tipo.titulo.toLowerCase()} importados</p>
              <button onClick={reset} className="text-xs text-emerald-600 underline underline-offset-2 mt-0.5">
                Importar más
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────
export default function Importar() {
  const { empresaActual } = useAuth()
  const [resumen, setResumen] = useState({})

  function onImportado(tipo, cantidad) {
    setResumen(prev => ({ ...prev, [tipo]: (prev[tipo] || 0) + cantidad }))
  }

  const totalImportado = Object.values(resumen).reduce((s, n) => s + n, 0)

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 grid gap-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-zinc-900">Importar datos</h1>
        <p className="text-zinc-500 text-sm mt-1 leading-snug">
          Venís de Tango, Genexus, Excel o cualquier sistema — traenos lo que tenés y lo ponemos en SAU.
        </p>
      </div>

      {/* Banner */}
      <div className="bg-gradient-to-r from-zinc-900 to-zinc-800 rounded-3xl px-5 py-4 flex items-center gap-4">
        <span className="text-3xl shrink-0">🔄</span>
        <div>
          <p className="text-white font-extrabold text-sm leading-tight">
            No empezás de cero
          </p>
          <p className="text-zinc-400 text-xs mt-0.5 leading-snug">
            Exportá desde tu sistema actual a CSV (Excel → Guardar como → CSV). Subís el archivo y SAU lo lee solo.
          </p>
        </div>
      </div>

      {totalImportado > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 flex items-center gap-2">
          <span className="text-lg">✅</span>
          <p className="text-emerald-800 font-bold text-sm">
            {totalImportado} registros importados esta sesión
          </p>
        </div>
      )}

      {/* Cards por tipo */}
      {Object.entries(TIPOS).map(([id, tipo]) => (
        <TipoCard
          key={id}
          id={id}
          tipo={tipo}
          empresaId={empresaActual?.id}
          onImportado={onImportado}
        />
      ))}

      {/* Próximamente */}
      <div className="border border-dashed border-zinc-200 rounded-3xl px-5 py-5 text-center">
        <p className="text-2xl mb-2">🤖</p>
        <p className="font-extrabold text-zinc-700 text-sm">Mapeo inteligente con IA</p>
        <p className="text-zinc-400 text-xs mt-1 leading-snug">
          Próximamente: subís cualquier archivo de Tango, Genexus o SAP y la IA mapea las columnas automáticamente.
        </p>
      </div>

    </div>
  )
}
