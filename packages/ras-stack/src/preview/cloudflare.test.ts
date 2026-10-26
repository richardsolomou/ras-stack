import { describe, expect, it, vi } from 'vitest'
import { CloudflarePreviewDns } from './cloudflare.js'

const options = {
  apiToken: 'secret',
  zoneId: '0123456789abcdef0123456789abcdef',
}

describe('Cloudflare preview DNS', () => {
  it('creates a proxied A record owned by the preview', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ success: true, result: [] }))
      .mockResolvedValueOnce(Response.json({ success: true, result: { id: 'record-1' } }))
    const dns = new CloudflarePreviewDns({ ...options, fetch: request })

    await dns.upsert({ hostname: 'example-pr-42.example.com', originIp: '8.8.8.8', owner: 'example-pr-42' })

    expect(request).toHaveBeenCalledTimes(2)
    expect(request.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({
        type: 'A',
        name: 'example-pr-42.example.com',
        content: '8.8.8.8',
        proxied: true,
        ttl: 1,
        comment: 'ras-stack preview example-pr-42',
      }),
    })
  })

  it('updates an owned record when the Dokploy IP changes', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          result: [
            {
              id: 'record-1',
              type: 'A',
              name: 'example-pr-42.example.com',
              content: '1.1.1.1',
              proxied: true,
              comment: 'ras-stack preview example-pr-42',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(Response.json({ success: true, result: { id: 'record-1' } }))
    const dns = new CloudflarePreviewDns({ ...options, fetch: request })

    await dns.upsert({ hostname: 'example-pr-42.example.com', originIp: '8.8.8.8', owner: 'example-pr-42' })

    expect(request.mock.calls[1]?.[0]).toBe(
      'https://api.cloudflare.com/client/v4/zones/0123456789abcdef0123456789abcdef/dns_records/record-1',
    )
    expect(request.mock.calls[1]?.[1]?.method).toBe('PUT')
  })

  it('refuses to replace a record it does not own', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        success: true,
        result: [
          {
            id: 'record-1',
            type: 'A',
            name: 'example-pr-42.example.com',
            content: '1.1.1.1',
            proxied: true,
            comment: 'production',
          },
        ],
      }),
    )
    const dns = new CloudflarePreviewDns({ ...options, fetch: request })

    await expect(dns.upsert({ hostname: 'example-pr-42.example.com', originIp: '8.8.8.8', owner: 'example-pr-42' })).rejects.toThrow(
      'not owned by ras-stack',
    )
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('deletes only the record owned by the preview', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          result: [
            {
              id: 'record-1',
              type: 'A',
              name: 'example-pr-42.example.com',
              content: '8.8.8.8',
              proxied: true,
              comment: 'ras-stack preview example-pr-42',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(Response.json({ success: true, result: { id: 'record-1' } }))
    const dns = new CloudflarePreviewDns({ ...options, fetch: request })

    await dns.delete({ hostname: 'example-pr-42.example.com', owner: 'example-pr-42' })

    expect(request.mock.calls[1]?.[1]?.method).toBe('DELETE')
  })
})
