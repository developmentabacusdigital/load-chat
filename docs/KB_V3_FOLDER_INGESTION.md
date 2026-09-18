# Knowledge Base V3: Folder-Based OneNote Ingestion

## Scope

V3 adds an isolated ingestion path for the exported OneNote knowledge base. The first V3 change is intentionally **ingestion/storage only**. Existing V1/V2 ingestion and chat retrieval paths are not changed.

## Folder identity

The first folder below the selected browser directory is the authoritative V3 knowledge scope.

Example:

```text
OneNote Export/
├── PMP-25/
│   ├── 01 - Data Sheet.pdf
│   └── 02 - Installation.pdf
├── TP-2/
│   └── 01 - Manual.pdf
└── Acronyms/
    └── Terms.pdf
```

V3 records preserve the relative path and store the folder as `source_folder`.

- Product folders use `knowledge_scope: product` and `product_name` equal to the folder name.
- Reference folders (`Acronyms`, `Price List`, `Product History`, `Ref Information`) use `knowledge_scope: reference`.
- Legacy product folders remain ingestible and are not discarded because they are old or obsolete.
- Shopify product tagging is not required for V3 ingestion.
- Non-PDF files are reported as unsupported rather than silently dropped.

## Storage isolation

V3 writes to `public.documents_gemini_v3`. V1/V2 tables are untouched.

Run the migration:

```text
supabase/migrations/20260918_create_documents_gemini_v3.sql
```

The table uses the same 3072-dimensional embedding shape as the existing Gemini Embedding 2 pipeline.

## API

### `POST /ingest/v3/folder`

Multipart fields:

- `files`: one or more recursively selected files
- `paths`: JSON array containing one browser-relative path for each file
- `replace`: whether matching `source_path` records should be replaced

The endpoint parses PDFs with the existing Docling setup, chunks them with the existing chunker, embeds with Gemini Embedding 2 through OpenRouter, and stores V3 metadata.

### `GET /documents/v3`

Returns one record per ingested source path using chunk `0` metadata.

### `DELETE /documents/v3/{source_path}`

Deletes all chunks associated with the V3 relative source path.

## Admin

The Admin version switch now exposes `V1`, `V2`, and `V3`.

V3 provides a browser folder picker, shows detected knowledge folders and PDF counts, and imports the selected folder without Shopify tagging.

## Deliberate non-goals for this PR

- No V1 changes.
- No V2 retrieval changes.
- No changes to the chat worker.
- No Shopify handle resolution.
- No product-card changes.
- No Self-RAG or response-validation work.

Those can be handled after the V3 knowledge store is populated and validated.
