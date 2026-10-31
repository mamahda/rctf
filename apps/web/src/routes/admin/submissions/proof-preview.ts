export type ProofPreviewKind = 'image' | 'text' | 'video' | 'audio' | 'none'

// Text previews stop here so huge files do not freeze the page.
export const MAX_TEXT_PREVIEW_CHARS = 200_000

const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'avif',
  'ico',
])
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'ogv'])
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'oga', 'm4a', 'flac'])

const PREVIEW_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  avif: 'image/avif',
  ico: 'image/x-icon',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  ogv: 'video/ogg',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  m4a: 'audio/mp4',
  flac: 'audio/flac',
}

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

// Decodes bytes as text when they look like a text file, otherwise null.
export function decodeText(bytes: Uint8Array): string | null {
  const sample = bytes.subarray(0, 64 * 1024)
  if (sample.includes(0)) {
    return null
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

// HTML, XML and other markup only ever reach the text preview, never a
// renderer, so an uploaded file cannot run script in the admin's session.
export function detectPreviewKind(
  name: string,
  _contentType: string,
  bytes: Uint8Array
): ProofPreviewKind {
  const ext = fileExtension(name)

  if (IMAGE_EXTENSIONS.has(ext)) {
    return 'image'
  }
  if (VIDEO_EXTENSIONS.has(ext)) {
    return 'video'
  }
  if (AUDIO_EXTENSIONS.has(ext)) {
    return 'audio'
  }
  return decodeText(bytes) === null ? 'none' : 'text'
}

// The MIME type used for the in-page blob of a previewable file.
export function previewMimeType(
  kind: ProofPreviewKind,
  name: string,
  _contentType: string
): string {
  const ext = fileExtension(name)
  if (kind === 'image' || kind === 'video' || kind === 'audio') {
    return PREVIEW_MIME[ext] ?? 'application/octet-stream'
  }
  return 'application/octet-stream'
}

export function base64ToBytes(data: string): Uint8Array {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
