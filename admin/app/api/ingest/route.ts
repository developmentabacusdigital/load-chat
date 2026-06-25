import { NextRequest, NextResponse } from 'next/server'

const HF_SPACE_URL = process.env.HF_SPACE_URL!
const HF_TOKEN     = process.env.HF_TOKEN!

// Ingestion can take 2–5 minutes for large PDFs
export const maxDuration = 300

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const res  = await fetch(`${HF_SPACE_URL}/ingest`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${HF_TOKEN}` },
      body: form,
    })
    const text = await res.text()
    try {
      const data = JSON.parse(text)
      return NextResponse.json(data, { status: res.status })
    } catch {
      return NextResponse.json({ error: `Server error: ${text.slice(0, 200)}` }, { status: 500 })
    }
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
