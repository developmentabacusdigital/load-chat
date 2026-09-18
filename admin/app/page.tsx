'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

const HF_URL   = process.env.NEXT_PUBLIC_HF_SPACE_URL!
const HF_TOKEN = process.env.NEXT_PUBLIC_HF_TOKEN!

interface Product { title: string; handle: string; image?: string }
interface Doc     { source: string; source_path?: string; source_folder?: string; knowledge_scope?: string; product_name?: string | null; product_handles: string[]; engine?: string }
interface V3File { file: File; path: string; folder: string }
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
  // Per-document product-tag editing (in-place, no re-ingest)
  const [savingSource, setSavingSource] = useState<string | null>(null)  // doc being PATCHed
  const [addingFor, setAddingFor]       = useState<string | null>(null)  // doc whose add-popover is open
  const [addSelected, setAddSelected]   = useState<string[]>([])         // multi-select staging
  const [addSearch, setAddSearch]       = useState('')
  // Which knowledge base the admin is managing: v1 (live) or v2 (A/B project)
  const [ver, setVer] = useState<'v1' | 'v2' | 'v3'>('v1')
  const [v3Files, setV3Files] = useState<V3File[]>([])
  const v3FileRef = useRef<HTMLInputElement>(null)
  const fileRef  = useRef<HTMLInputElement>(null)
  const dropRef  = useRef<HTMLDivElement>(null)
  const addRef   = useRef<HTMLDivElement>(null)

  // Route bases per active version. v1: /documents, /ingest ; v2: /documents/v2, /ingest/v2
  const docBase    = ver === 'v3' ? '/documents/v3' : ver === 'v2' ? '/documents/v2' : '/documents'
  const ingestPath = ver === 'v3' ? '/ingest/v3/folder' : ver === 'v2' ? '/ingest/v2' : '/ingest'

  useEffect(() => {
    fetch('/api/products').then(r => r.json()).then(setProducts).catch(() => {})
  }, [])

  useEffect(() => {
    if (v3FileRef.current) v3FileRef.current.setAttribute('webkitdirectory', '')
  }, [ver])

  // (Re)load documents whenever the active version changes
  useEffect(() => {
    loadDocs(ver)
    closeAdd()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ver])

  // Close dropdowns / popovers when clicking outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      const t = e.target as Node
      if (dropRef.current && !dropRef.current.contains(t)) setShowDrop(false)
      if (addRef.current && !addRef.current.contains(t)) closeAdd()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function loadDocs(v: 'v1' | 'v2' | 'v3' = ver) {
    const base = v === 'v3' ? '/documents/v3' : v === 'v2' ? '/documents/v2' : '/documents'
    fetch(`${HF_URL}${base}`, { headers: { 'Authorization': `Bearer ${HF_TOKEN}` } })
      .then(r => r.json()).then(d => setDocs(Array.isArray(d) ? d : [])).catch(() => {})
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
      const r    = await fetch(`${HF_URL}${ingestPath}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${HF_TOKEN}` },
        body: form,
      })
      const text = await r.text()
      let data: Record<string, unknown>
      try { data = JSON.parse(text) } catch { throw new Error(text.slice(0, 200)) }
      if (!r.ok) throw new Error(String(data.detail ?? data.error ?? 'Upload failed'))
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

  function selectV3Folder(list: FileList | null) {
    if (!list) return
    const files = Array.from(list).map(file => {
      const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
      const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
      const folder = parts.length >= 3 ? parts[1] : parts.length === 2 ? parts[0] : ''
      return { file, path, folder }
    })
    setV3Files(files)
    setStatus({ type: 'idle', msg: '' })
  }

  async function handleV3Upload() {
    if (!v3Files.length) return
    const pdfs = v3Files.filter(x => x.file.name.toLowerCase().endsWith('.pdf'))
    const folders = Array.from(new Set(pdfs.map(x => x.folder).filter(Boolean)))
    setUploading(true)
    setStatus({ type: 'loading', msg: `Preparing ${pdfs.length} PDFs across ${folders.length} folder${folders.length === 1 ? '' : 's'}…` })
    try {
      const form = new FormData()
      const paths: string[] = []
      for (const item of v3Files) {
        form.append('files', item.file, item.file.name)
        paths.push(item.path)
      }
      form.append('paths', JSON.stringify(paths))
      form.append('replace', String(replace))

      const r = await fetch(`${HF_URL}${ingestPath}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${HF_TOKEN}` },
        body: form,
      })
      const text = await r.text()
      let data: Record<string, any>
      try { data = JSON.parse(text) } catch { throw new Error(text.slice(0, 300)) }
      if (!r.ok) throw new Error(String(data.detail ?? data.error ?? 'V3 folder ingestion failed'))

      const summary = data.summary ?? {}
      const unsupported = Array.isArray(data.unsupported) ? data.unsupported.length : 0
      setStatus({
        type: 'success',
        msg: `✓ V3 ingested ${summary.pdfs ?? pdfs.length} PDFs · ${summary.chunks_saved ?? 0}/${summary.chunks_total ?? 0} chunks saved${unsupported ? ` · ${unsupported} unsupported file${unsupported === 1 ? '' : 's'} reported` : ''}`,
      })
      setV3Files([])
      if (v3FileRef.current) v3FileRef.current.value = ''
      loadDocs('v3')
    } catch (e: unknown) {
      setStatus({ type: 'error', msg: e instanceof Error ? e.message : 'Unknown error' })
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(source: string) {
    if (!confirm(`Delete all knowledge from "${source}" (${ver.toUpperCase()})? This cannot be undone.`)) return
    setDeleting(source)
    await fetch(`${HF_URL}${docBase}/${encodeURIComponent(ver === 'v3' ? (docs.find(d => d.source === source)?.source_path ?? source) : source)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${HF_TOKEN}` },
    })
    setDeleting(null)
    loadDocs()
  }

  // Core: persist a document's full handle list, update the row optimistically.
  async function patchHandles(source: string, handles: string[]) {
    setSavingSource(source)
    const prev = docs.find(d => d.source === source)?.product_handles ?? []
    setDocs(ds => ds.map(d => d.source === source ? { ...d, product_handles: handles } : d))
    try {
      const r = await fetch(`${HF_URL}${docBase}/${encodeURIComponent(source)}/products`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${HF_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_handles: handles }),
      })
      if (!r.ok) throw new Error((await r.text()).slice(0, 200))
    } catch (e: unknown) {
      setDocs(ds => ds.map(d => d.source === source ? { ...d, product_handles: prev } : d))  // rollback
      setStatus({ type: 'error', msg: e instanceof Error ? e.message : 'Failed to update tags' })
    } finally {
      setSavingSource(null)
    }
  }

  function removeProduct(source: string, handle: string) {
    const current = docs.find(d => d.source === source)?.product_handles ?? []
    patchHandles(source, current.filter(h => h !== handle))
  }

  function openAdd(source: string) {
    setAddingFor(source)
    setAddSelected([])
    setAddSearch('')
  }

  function closeAdd() {
    setAddingFor(null)
    setAddSelected([])
    setAddSearch('')
  }

  function toggleAddSelect(handle: string) {
    setAddSelected(s => s.includes(handle) ? s.filter(h => h !== handle) : [...s, handle])
  }

  async function confirmAdd(source: string) {
    const current = docs.find(d => d.source === source)?.product_handles ?? []
    const merged = [...current, ...addSelected.filter(h => !current.includes(h))]
    closeAdd()
    await patchHandles(source, merged)
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

          {/* v1 / v2 / v3 knowledge-base toggle */}
          <div className="ml-auto inline-flex items-center p-0.5 rounded-[8px] border border-[#ebebeb] bg-[#f2f2f2]">
            {(['v1', 'v2', 'v3'] as const).map(v => (
              <button
                key={v}
                onClick={() => setVer(v)}
                title={v === 'v1' ? 'Live project' : v === 'v2' ? 'A/B project' : 'V3 folder-based OneNote knowledge base'}
                className={`text-[12px] font-medium px-3 py-1 rounded-[6px] transition-colors ${
                  ver === v ? 'bg-white text-[#171717] shadow-sm' : 'text-[#8f8f8f] hover:text-[#171717]'
                }`}
              >
                {v.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Upload card */}
        {ver === 'v3' ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100 rounded-t-2xl flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-800">V3 · Import OneNote Folders</h2>
                <p className="text-xs text-gray-400 mt-0.5">Folder name is the knowledge identity · PDFs are parsed with Docling + Gemini Embedding 2</p>
              </div>
              <span className="text-[11px] font-mono uppercase tracking-wide text-[#8f8f8f] bg-[#f2f2f2] border border-[#ebebeb] px-2 py-1 rounded-[6px]">→ V3 isolated KB</span>
            </div>

            <div className="p-6 space-y-4">
              <div
                className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all ${
                  v3Files.length ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-brand/40 hover:bg-gray-50'
                }`}
                onClick={() => v3FileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
              >
                <input
                  ref={v3FileRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={e => { selectV3Folder(e.target.files); e.target.value = '' }}
                />
                {v3Files.length ? (
                  <div>
                    <div className="text-3xl mb-2">📁</div>
                    <div className="text-sm font-semibold text-green-700">{v3Files.length} files selected</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {Array.from(new Set(v3Files.map(x => x.folder).filter(Boolean))).length} top-level knowledge folders · {v3Files.filter(x => x.file.name.toLowerCase().endsWith('.pdf')).length} PDFs
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); setV3Files([]) }}
                      className="mt-3 text-xs text-gray-500 hover:text-red-500"
                    >Clear selection</button>
                  </div>
                ) : (
                  <div className="text-gray-400">
                    <div className="text-3xl mb-2">📂</div>
                    <div className="text-sm font-medium text-gray-600">Choose the exported OneNote root folder</div>
                    <div className="text-xs mt-1">Nested PDFs are included automatically · unsupported files are reported</div>
                  </div>
                )}
              </div>

              {v3Files.length > 0 && (
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-600">Detected knowledge folders</div>
                  <div className="max-h-44 overflow-y-auto divide-y divide-gray-100">
                    {Array.from(new Set(v3Files.map(x => x.folder).filter(Boolean))).sort().map(folder => {
                      const items = v3Files.filter(x => x.folder === folder)
                      const pdfCount = items.filter(x => x.file.name.toLowerCase().endsWith('.pdf')).length
                      return <div key={folder} className="px-4 py-2 flex items-center justify-between text-sm"><span className="font-medium text-gray-700 truncate">{folder}</span><span className="text-xs text-gray-400">{pdfCount} PDF · {items.length - pdfCount} other</span></div>
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
                  <input type="checkbox" checked={replace} onChange={e => setReplace(e.target.checked)} className="w-4 h-4 accent-brand rounded" />
                  Replace matching relative paths
                </label>
                <button
                  onClick={handleV3Upload}
                  disabled={!v3Files.length || uploading}
                  className="bg-brand hover:bg-brand-dark disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
                >{uploading ? 'Processing…' : 'Import Folder'}</button>
              </div>

              {status.type !== 'idle' && <div className={`text-sm px-4 py-2.5 rounded-lg ${statusColors[status.type]}`}>{status.msg}</div>}
            </div>
          </div>
        ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 rounded-t-2xl flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-800">Upload Document</h2>
              <p className="text-xs text-gray-400 mt-0.5">PDF files only · Parsed with Docling · Embedded with Gemini Embedding 2</p>
            </div>
            <span className="text-[11px] font-mono uppercase tracking-wide text-[#8f8f8f] bg-[#f2f2f2] border border-[#ebebeb] px-2 py-1 rounded-[6px] whitespace-nowrap">
              → {ver.toUpperCase()} {ver === 'v2' ? 'hybrid pipeline' : 'knowledge base'}
            </span>
          </div>

          <div className="p-6 space-y-4">
            {/* Existing V1/V2 upload UI remains unchanged below. */}
            <div
              className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all ${dragging ? 'border-brand bg-brand-light' : file ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-brand/40 hover:bg-gray-50'}`}
              onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={onDrop} onClick={() => fileRef.current?.click()}
            >
              <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f); e.target.value = '' }} />
              {file ? <div className="flex items-center justify-center gap-3"><span className="text-3xl">📄</span><div className="text-left"><div className="font-medium text-green-700 text-sm">{file.name}</div><div className="text-xs text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} MB</div></div><button onClick={e => { e.stopPropagation(); setFile(null) }} className="ml-2 text-gray-400 hover:text-red-500 text-lg leading-none">×</button></div> : <div className="text-gray-400"><div className="text-3xl mb-2">📁</div><div className="text-sm font-medium text-gray-600">Drop PDF here or click to browse</div></div>}
            </div>

            <div ref={dropRef} className="relative">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Tag to products {products.length > 0 && <span className="text-gray-300 font-normal normal-case tracking-normal">({products.length} loaded from Shopify)</span>}</label>
              {selected.length > 0 && <div className="flex flex-wrap gap-1.5 mb-2">{selected.map(h => { const p = products.find(p => p.handle === h); return <span key={h} className="inline-flex items-center gap-1 bg-brand-light text-brand text-xs font-semibold px-2.5 py-1 rounded-full">{p?.title ?? h}<button onClick={() => toggleHandle(h)} className="hover:text-brand-dark text-sm leading-none ml-0.5">×</button></span> })}</div>}
              <input value={search} onChange={e => { setSearch(e.target.value); setShowDrop(true) }} onFocus={() => setShowDrop(true)} placeholder={products.length ? 'Search products...' : 'No Shopify products — Storefront token not configured'} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand transition-colors" />
              {showDrop && search && filtered.length > 0 && <div className="absolute z-10 w-full mt-1 border border-gray-200 rounded-xl shadow-lg bg-white max-h-48 overflow-y-auto">{filtered.map(p => <div key={p.handle} onMouseDown={() => { toggleHandle(p.handle); setSearch('') }} className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer text-sm hover:bg-gray-50 ${selected.includes(p.handle) ? 'bg-brand-light/60' : ''}`}><div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${selected.includes(p.handle) ? 'bg-brand border-brand' : 'border-gray-300'}`}>{selected.includes(p.handle) && <span className="text-white text-[10px] leading-none">✓</span>}</div>{p.image && <img src={p.image} className="w-7 h-7 rounded object-cover flex-shrink-0" alt="" />}<span className="text-gray-700 flex-1 truncate">{p.title}</span><span className="text-gray-300 text-xs flex-shrink-0">{p.handle}</span></div>)}</div>}
            </div>

            <div className="flex items-center justify-between pt-1"><label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600"><input type="checkbox" checked={replace} onChange={e => setReplace(e.target.checked)} className="w-4 h-4 accent-brand rounded" />Replace if document already exists</label><button onClick={handleUpload} disabled={!file || uploading} className="bg-brand hover:bg-brand-dark disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors">{uploading ? 'Processing...' : 'Upload & Ingest'}</button></div>
            {status.type !== 'idle' && <div className={`text-sm px-4 py-2.5 rounded-lg ${statusColors[status.type]}`}>{status.msg}</div>}
          </div>
        </div>
        )}

        {/* Knowledge Base */}
        <div className="bg-white rounded-[12px] border border-[#ebebeb]">
          <div className="px-6 py-4 border-b border-[#ebebeb] flex items-center justify-between">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-wide text-[#8f8f8f]">Knowledge Base · {ver.toUpperCase()}</div>
              <h2 className="text-[15px] font-semibold text-[#171717] tracking-tight -mt-0.5">
                {docs.length} document{docs.length !== 1 ? 's' : ''}
              </h2>
            </div>
            <button
              onClick={() => loadDocs()}
              className="text-[13px] font-medium text-[#171717] bg-white border border-[#ebebeb] hover:bg-[#f2f2f2] rounded-[6px] px-3 py-1.5 transition-colors"
            >
              Refresh
            </button>
          </div>

          {docs.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="text-3xl mb-2 opacity-60">📭</div>
              <div className="text-[13px] text-[#8f8f8f]">No documents ingested yet. Upload one above.</div>
            </div>
          ) : (
            <div className="divide-y divide-[#ebebeb]">
              {docs.map((doc, idx) => {
                const handles   = doc.product_handles ?? []
                const isSaving  = savingSource === doc.source
                const isAdding  = addingFor === doc.source
                const openUp    = docs.length > 2 && idx >= docs.length - 2  // flip last rows upward
                const addFiltered = products.filter(p =>
                  !handles.includes(p.handle) &&
                  (p.title.toLowerCase().includes(addSearch.toLowerCase()) ||
                   p.handle.toLowerCase().includes(addSearch.toLowerCase()))
                )
                return (
                <div key={doc.source} className="px-6 py-4 flex items-start gap-3.5 hover:bg-[#fafafa] transition-colors last:rounded-b-[12px]">
                  <span className="text-lg mt-0.5 flex-shrink-0 opacity-80">📄</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-medium text-[14px] text-[#171717] truncate">{ver === 'v3' ? (doc.source_path ?? doc.source) : doc.source}</div>
                      {isSaving && (
                        <svg className="animate-spin w-3.5 h-3.5 text-[#a1a1a1] flex-shrink-0" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3V0a12 12 0 100 24v-4l-3 3 3 3v4A12 12 0 014 12z"/>
                        </svg>
                      )}
                    </div>

                    {ver === 'v3' ? (
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-[#8f8f8f] bg-[#f5f5f5] px-2 py-1 rounded">{doc.knowledge_scope ?? 'product'}</span>
                        {doc.product_name && <span className="text-[12px] text-[#555] truncate">Folder: {doc.product_name}</span>}
                      </div>
                    ) : (
                    <>
                    {/* Connected product previews + add control */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {handles.map(h => {
                        const p = products.find(p => p.handle === h)
                        return (
                          <div
                            key={h}
                            title={p?.title ?? h}
                            className="group relative inline-flex items-center gap-1.5 bg-white border border-[#ebebeb] rounded-[6px] pl-1 pr-2 py-1 hover:border-[#d4d4d4] transition-colors"
                          >
                            {p?.image
                              ? <img src={p.image} className="w-5 h-5 rounded-[4px] object-cover flex-shrink-0" alt="" />
                              : <span className="w-5 h-5 rounded-[4px] bg-[#f2f2f2] text-[#8f8f8f] text-[9px] font-semibold flex items-center justify-center flex-shrink-0">
                                  {(p?.title ?? h).slice(0, 2).toUpperCase()}
                                </span>
                            }
                            <span className="text-[12px] text-[#171717] max-w-[150px] truncate">{p?.title ?? h}</span>
                            <button
                              onClick={() => removeProduct(doc.source, h)}
                              disabled={isSaving}
                              title="Remove"
                              className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-white border border-[#ebebeb] shadow-sm text-[#8f8f8f] hover:text-white hover:bg-[#ee0000] hover:border-[#ee0000] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all disabled:opacity-0"
                            >
                              <svg width="7" height="7" viewBox="0 0 8 8" fill="none"><path d="M1 1l6 6M7 1l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                            </button>
                          </div>
                        )
                      })}

                      {/* Add product */}
                      <div className="relative" ref={isAdding ? addRef : undefined}>
                        <button
                          onClick={() => (isAdding ? closeAdd() : openAdd(doc.source))}
                          disabled={isSaving}
                          className="inline-flex items-center gap-1 text-[12px] font-medium text-[#4d4d4d] bg-white border border-dashed border-[#d4d4d4] hover:border-[#171717] hover:text-[#171717] rounded-[6px] px-2 py-1 transition-colors disabled:opacity-40"
                        >
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                          Add product
                        </button>

                        {isAdding && (
                          <div className={`absolute z-50 left-0 w-[300px] bg-white border border-[#ebebeb] rounded-[12px] shadow-[0px_2px_2px_rgba(0,0,0,0.04),0px_8px_16px_-4px_rgba(0,0,0,0.08)] overflow-hidden ${openUp ? 'bottom-full mb-1.5' : 'mt-1.5'}`}>
                            <div className="p-2 border-b border-[#ebebeb]">
                              <input
                                autoFocus
                                value={addSearch}
                                onChange={e => setAddSearch(e.target.value)}
                                placeholder={products.length ? 'Search products…' : 'No Shopify products loaded'}
                                className="w-full text-[13px] text-[#171717] placeholder:text-[#a1a1a1] border border-[#ebebeb] rounded-[6px] px-2.5 py-1.5 focus:outline-none focus:border-[#171717] transition-colors"
                              />
                            </div>
                            <div className="max-h-56 overflow-y-auto py-1">
                              {addFiltered.length === 0 ? (
                                <div className="px-3 py-6 text-center text-[12px] text-[#a1a1a1]">
                                  {products.length ? 'No matching products' : 'Connect a Storefront token to load products'}
                                </div>
                              ) : addFiltered.map(p => {
                                const checked = addSelected.includes(p.handle)
                                return (
                                  <button
                                    key={p.handle}
                                    onClick={() => toggleAddSelect(p.handle)}
                                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#fafafa] transition-colors"
                                  >
                                    <span className={`w-4 h-4 rounded-[4px] border flex items-center justify-center flex-shrink-0 transition-colors ${checked ? 'bg-[#171717] border-[#171717]' : 'border-[#d4d4d4]'}`}>
                                      {checked && <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5L8.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                                    </span>
                                    {p.image
                                      ? <img src={p.image} className="w-6 h-6 rounded-[4px] object-cover flex-shrink-0" alt="" />
                                      : <span className="w-6 h-6 rounded-[4px] bg-[#f2f2f2] text-[#8f8f8f] text-[9px] font-semibold flex items-center justify-center flex-shrink-0">{p.title.slice(0,2).toUpperCase()}</span>
                                    }
                                    <span className="text-[13px] text-[#171717] flex-1 truncate">{p.title}</span>
                                    <span className="text-[11px] text-[#a1a1a1] font-mono flex-shrink-0">{p.handle}</span>
                                  </button>
                                )
                              })}
                            </div>
                            <div className="flex items-center justify-between gap-2 p-2 border-t border-[#ebebeb] bg-[#fafafa]">
                              <button onClick={closeAdd} className="text-[13px] text-[#8f8f8f] hover:text-[#171717] px-2 py-1 transition-colors">Cancel</button>
                              <button
                                onClick={() => confirmAdd(doc.source)}
                                disabled={addSelected.length === 0}
                                className="text-[13px] font-medium text-white bg-[#171717] hover:bg-black disabled:opacity-30 disabled:cursor-not-allowed rounded-[6px] px-3 py-1.5 transition-colors"
                              >
                                Add{addSelected.length > 0 ? ` ${addSelected.length}` : ''}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {handles.length === 0 && !isAdding && (
                        <span className="text-[12px] text-[#a1a1a1]">No products connected</span>
                      )}
                    </div>
                    </>
                    )}
                  </div>

                  <button
                    onClick={() => handleDelete(doc.source)}
                    disabled={deleting === doc.source}
                    className="flex-shrink-0 text-[12px] font-medium text-[#a1a1a1] hover:text-[#ee0000] hover:bg-[#fff0f0] transition-colors px-2.5 py-1.5 rounded-[6px] disabled:opacity-40"
                  >
                    {deleting === doc.source ? '…' : 'Delete'}
                  </button>
                </div>
                )
              })}
            </div>
          )}
        </div>

        <p className="text-center font-mono text-[11px] uppercase tracking-wide text-[#a1a1a1]">Miss MoMo Admin · Load Controls Inc.</p>
      </div>
    </main>
  )
}
