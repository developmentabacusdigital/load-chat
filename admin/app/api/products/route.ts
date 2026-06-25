import { NextResponse } from 'next/server'

const SHOPIFY_DOMAIN          = process.env.SHOPIFY_STORE_DOMAIN
const SHOPIFY_STOREFRONT_TOKEN = process.env.SHOPIFY_STOREFRONT_TOKEN

const QUERY = `{
  products(first: 250) {
    edges {
      node {
        title
        handle
        featuredImage { url }
      }
    }
  }
}`

export async function GET() {
  if (!SHOPIFY_DOMAIN || !SHOPIFY_STOREFRONT_TOKEN) {
    return NextResponse.json([])
  }
  try {
    const res = await fetch(
      `https://${SHOPIFY_DOMAIN}/api/2024-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': SHOPIFY_STOREFRONT_TOKEN,
        },
        body: JSON.stringify({ query: QUERY }),
        next: { revalidate: 300 },
      }
    )
    const json = await res.json()
    const products = (json.data?.products?.edges ?? []).map(
      ({ node }: { node: { title: string; handle: string; featuredImage?: { url: string } } }) => ({
        title:  node.title,
        handle: node.handle,
        image:  node.featuredImage?.url,
      })
    )
    return NextResponse.json(products)
  } catch (e) {
    return NextResponse.json([])
  }
}
