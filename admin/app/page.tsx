'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface Product { title: string; handle: string; image?: string }
interface Doc     { source: string; product_handles: string[]; engine?: string }
type StatusType = 'idle' | 'loading' | 'success' | 'error'

export default function Page() {
  const [file, setFile]           = useState<File | null>(null)
  const [dragging, setDragging]   = useState(false)
  const [products, setProducts]   = useState<Product[]>([])
  const [docs, setDocs]           = useState<Doc[]>([])
  const [selected, setSelected]   = useState<string[]>([])
  const [search, setSearch]       = useState('')
  const [showDrop, setShowDrop]   = useState(false)
  const [replace, setReplace]     = useState(true)
  const [uploading, setUploading] = useState(false)
  const [status, setStatus]       = useState<{ type: StatusType; msg: string }>({ type: 'idle', msg: '' })
  const [deleting, setDeleting]   = useState<string | null>(null)
  const fileRef  = useRef<HTMLInputElement>(null)
  const dropRef  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/products').then(r => r.json()).then(setProducts).catch(() => {})
    loadDocs()
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setShowDrop(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function loadDocs() {
    fetch('/api/documents').then(r => r.json()).then(d => setDocs(Array.isArray(d) ? d : [])).catch(() => {})
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f?.name.toLowerCase().endsWith('.pdf')) setFile(f)
  }, [])

  function toggleHandle(handle: string) {
    setSelected(s => s.includes(handle) ? s.filter(h => h !== handle) : [...s, handle])
  }

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    setStatus({ type: 'loading', msg: `Parsing ${file.name} — this takes 2–5 minutes. Please keep this tab open...` })
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('product_handles', selected.join(','))
      form.append('replace', String(replace))
      const r    = await fetch('/api/ingest', { method: 'POST', body: form })
      const data = await r.json()
      if (!r.ok) throw new Error(data.detail || data.error || 'Upload failed')
      setStatus({ type: 'success', msg: `✓ ${data.chunks_saved}/${data.chunks_total} chunks saved for "${data.source}"` })
      setFile(null)
      setSelected([])
      loadDocs()
    } catch (e: unknown) {
      setStatus({ type: 'error', msg: e instanceof Error ? e.message : 'Unknown error' })
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(source: string) {
    if (!confirm(`Delete all knowledge from "${source}"? This cannot be undone.`)) return
    setDeleting(source)
    await fetch(`/api/documents/${encodeURIComponent(source)}`, { method: 'DELETE' })
    setDeleting(null)
    loadDocs()
  }

  const filtered = products.filter(p =>
    p.title.toLowerCase().includes(search.toLowerCase()) ||
    p.handle.toLowerCase().includes(search.toLowerCase())
  )

  const statusColors: Record<StatusType, string> = {
    idle:    '',
    loading: 'bg-blue-50 text-blue-700 border border-blue-100',
    success: 'bg-green-50 text-green-700 border border-green-100',
    error:   'bg-red-50 text-red-700 border border-red-100',
  }

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand flex items-center justify-center text-white font-bold text-lg shadow-sm">M</div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-tight">Miss MoMo Admin</h1>
            <p className="text-xs text-gray-400">Load Controls knowledge base</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-100 px-3 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block"></span>
            Connected
          </div>
        </div>

        {/* Upload card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 rounded-t-2xl">
            <h2 className="font-semibold text-gray-800">Upload Document</h2>
            <p className="text-xs text-gray-400 mt-0.5">PDF files only · Parsed with Docling · Embedded with Gemini Embedding 2</p>
          </div>

          <div className="p-6 space-y-4">
            {/* Drop zone */}
            <div
              className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all ${
                dragging  ? 'border-brand bg-brand-light' :
                file      ? 'border-green-400 bg-green-50' :
                            'border-gray-200 hover:border-brand/40 hover:bg-gray-50'
              }`}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f); e.target.value = '' }}
              />
              {file ? (
                <div className="flex items-center justify-center gap-3">
                  <span className="text-3xl">📄</span>
                  <div className="text-left">
                    <div className="font-medium text-green-700 text-sm">{file.name}</div>
                    <div className="text-xs text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); setFile(null) }}
                    className="ml-2 text-gray-400 hover:text-red-500 text-lg leading-none"
                  >×</button>
                </div>
              ) : (
                <div className="text-gray-400">
                  <div className="text-3xl mb-2">📁</div>
                  <div className="text-sm font-medium text-gray-600">Drop PDF here or click to browse</div>
                </div>
              )}
            </div>

            {/* Product tag selector */}
            <div ref={dropRef} className="relative">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                Tag to products {products.length > 0 && <span className="text-gray-300 font-normal normal-case tracking-normal">({products.length} loaded from Shopify)</span>}
              </label>

              {/* Selected chips */}
              {selected.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selected.map(h => {
                    const p = products.find(p => p.handle === h)
                    return (
                      <span key={h} className="inline-flex items-center gap-1 bg-brand-light text-brand text-xs font-semibold px-2.5 py-1 rounded-full">
                        {p?.title ?? h}
                        <button onClick={() => toggleHandle(h)} className="hover:text-brand-dark text-sm leading-none ml-0.5">×</button>
                      </span>
                    )
                  })}
                </div>
              )}

              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setShowDrop(true) }}
                onFocus={() => setShowDrop(true)}
                placeholder={products.length ? 'Search products...' : 'No Shopify products — Storefront token not configured'}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand transition-colors"
              />

              {showDrop && search && filtered.length > 0 && (
                <div className="absolute z-10 w-full mt-1 border border-gray-200 rounded-xl shadow-lg bg-white max-h-48 overflow-y-auto">
                  {filtered.map(p => (
                    <div
                      key={p.handle}
                      onMouseDown={() => { toggleHandle(p.handle); setSearch('') }}
                      className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer text-sm hover:bg-gray-50 ${selected.includes(p.handle) ? 'bg-brand-light/60' : ''}`}
                    >
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                        selected.includes(p.handle) ? 'bg-brand border-brand' : 'border-gray-300'
                      }`}>
                        {selected.includes(p.handle) && <span className="text-white text-[10px] leading-none">✓</span>}
                      </div>
                      {p.image && <img src={p.image} className="w-7 h-7 rounded object-cover flex-shrink-0" alt="" />}
                      <span className="text-gray-700 flex-1 truncate">{p.title}</span>
                      <span className="text-gray-300 text-xs flex-shrink-0">{p.handle}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Options row */}
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={replace}
                  onChange={e => setReplace(e.target.checked)}
                  className="w-4 h-4 accent-brand rounded"
                />
                Replace if document already exists
              </label>
              <button
                onClick={handleUpload}
                disabled={!file || uploading}
                className="bg-brand hover:bg-brand-dark disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
              >
                {uploading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3V0a12 12 0 100 24v-4l-3 3 3 3v4A12 12 0 014 12z"/>
                    </svg>
                    Processing...
                  </span>
                ) : 'Upload & Ingest'}
              </button>
            </div>

            {/* Status message */}
            {status.type !== 'idle' && (
              <div className={`text-sm px-4 py-2.5 rounded-lg ${statusColors[status.type]}`}>
                {status.msg}
              </div>
            )}
          </div>
        </div>

        {/* Documents table */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Knowledge Base</h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">{docs.length} document{docs.length !== 1 ? 's' : ''}</span>
              <button onClick={loadDocs} className="text-xs text-gray-400 hover:text-gray-700 transition-colors">↻ Refresh</button>
            </div>
          </div>

          {docs.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="text-3xl mb-2">📭</div>
              <div className="text-sm text-gray-400">No documents ingested yet. Upload one above.</div>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {docs.map(doc => (
                <div key={doc.source} className="px-6 py-4 flex items-start gap-3 hover:bg-gray-50/50 transition-colors">
                  <span className="text-xl mt-0.5 flex-shrink-0">📄</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-800 truncate">{doc.source}</div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {doc.product_handles?.length > 0
                        ? doc.product_handles.map(h => {
                            const p = products.find(p => p.handle === h)
                            return (
                              <span key={h} className="inline-flex items-center gap-1 bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">
                                {p?.image && <img src={p.image} className="w-3 h-3 rounded-full object-cover" alt="" />}
                                {p?.title ?? h}
                              </span>
                            )
                          })
                        : <span className="text-xs text-gray-300 italic">No products tagged</span>
                      }
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(doc.source)}
                    disabled={deleting === doc.source}
                    className="flex-shrink-0 text-xs text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors px-3 py-1.5 rounded-lg disabled:opacity-40"
                  >
                    {deleting === doc.source ? '...' : 'Delete'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-300">Miss MoMo Admin · Load Controls Inc.</p>
      </div>
    </main>
  )
}
