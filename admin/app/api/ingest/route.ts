import { NextRequest, NextResponse } from 'next/server'

const HF_SPACE_URL = process.env.HF_SPACE_URL!
const HF_TOKEN     = process.env.HF_TOKEN!
const INGEST_KEY   = process.env.INGEST_API_KEY!

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const res  = await fetch(`${HF_SPACE_URL}/ingest`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HF_TOKEN}`,
        'X-Api-Key': INGEST_KEY,
      },
      body: form,
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
