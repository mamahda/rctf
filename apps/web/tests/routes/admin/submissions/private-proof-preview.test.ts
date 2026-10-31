import { describe, expect, test } from 'bun:test'
import {
  decodeText,
  detectPreviewKind,
  previewMimeType,
} from '../../../../src/routes/admin/submissions/proof-preview'

describe('private solver previews', () => {
  test('renders code and markup as escaped text, not active pages', () => {
    const bytes = new TextEncoder().encode('<script>alert(1)</script>')
    for (const name of ['solve.py', 'proof.html', 'proof.svg']) {
      expect(detectPreviewKind(name, 'text/html', bytes)).toBe('text')
      expect(decodeText(bytes)).toBe('<script>alert(1)</script>')
    }
  })

  test('does not trust an uploaded MIME type for previews', () => {
    const bytes = new TextEncoder().encode('example')
    expect(detectPreviewKind('proof.html', 'image/svg+xml', bytes)).toBe('text')
    expect(previewMimeType('image', 'proof.png', 'image/svg+xml')).toBe(
      'image/png'
    )
  })

  test('does not decode binary files as text', () => {
    expect(
      detectPreviewKind(
        'proof.bin',
        'application/octet-stream',
        new Uint8Array([0, 1])
      )
    ).toBe('none')
  })
})
