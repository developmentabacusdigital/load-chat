import { NextRequest, NextResponse } from 'next/server'

const HF_SPACE_URL = process.env.HF_SPACE_URL!
const HF_TOKEN = process.env.HF_TOKEN!

export const maxDuration = 300

type RouteContext = {
  params: {
    path: string[]
  }
}

async function proxy(req: NextRequest, { params }: RouteContext) {
  try {
    const path = params.path.join('/')
    const target = `${HF_SPACE_URL.replace(/\/$/, '')}/${path}`

    const headers = new Headers()
    headers.set('Authorization', `Bearer ${HF_TOKEN}`)

    const contentType = req.headers.get('content-type')
    if (contentType) {
      headers.set('Content-Type', contentType)
    }

    const init: RequestInit = {
      method: req.method,
      headers,
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      init.body = await req.arrayBuffer()
    }

    const response = await fetch(target, init)
    const body = await response.arrayBuffer()

    const responseHeaders = new Headers()
    const responseContentType = response.headers.get('content-type')

    if (responseContentType) {
      responseHeaders.set('Content-Type', responseContentType)
    }

    return new NextResponse(body, {
      status: response.status,
      headers: responseHeaders,
    })
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    )
  }
}

export async function GET(
  req: NextRequest,
  context: RouteContext
) {
  return proxy(req, context)
}

export async function POST(
  req: NextRequest,
  context: RouteContext
) {
  return proxy(req, context)
}

export async function PATCH(
  req: NextRequest,
  context: RouteContext
) {
  return proxy(req, context)
}

export async function DELETE(
  req: NextRequest,
  context: RouteContext
) {
  return proxy(req, context)
}   