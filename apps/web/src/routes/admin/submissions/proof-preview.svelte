<script lang="ts">
  import {
    GetAdminSubmissionProofRouteV2,
    GoodSubmissionProof,
  } from '@rctf/types'
  import { apiRequest } from '$lib/api'
  import Button from '$lib/ui/button.svelte'
  import Dialog from '$lib/ui/dialog.svelte'
  import Spinner from '$lib/ui/spinner.svelte'
  import { formatFileSize } from '$lib/utils/filesize'
  import {
    base64ToBytes,
    decodeText,
    detectPreviewKind,
    MAX_TEXT_PREVIEW_CHARS,
    previewMimeType,
    type ProofPreviewKind,
  } from './proof-preview'

  type Props = {
    submissionId: string
    open: boolean
    onOpenChange: (open: boolean) => void
  }
  let { submissionId, open, onOpenChange }: Props = $props()
  type Loaded = {
    name: string
    size: number
    kind: ProofPreviewKind
    bytes: Uint8Array
    text: string | null
    url: string | null
  }
  let loaded = $state<Loaded | null>(null)
  let error = $state<string | null>(null)
  $effect(() => {
    if (!open) return
    let cancelled = false
    let url: string | null = null
    loaded = null
    error = null
    apiRequest(GetAdminSubmissionProofRouteV2, { id: submissionId })
      .then(response => {
        if (cancelled) return
        if (response.kind !== GoodSubmissionProof.kind) {
          error = response.message
          return
        }
        const { name, size, contentType, data } = response.data
        const bytes = base64ToBytes(data)
        const kind = detectPreviewKind(name, contentType, bytes)
        if (kind === 'image' || kind === 'video' || kind === 'audio') {
          url = URL.createObjectURL(
            new Blob([bytes as BlobPart], {
              type: previewMimeType(kind, name, contentType),
            })
          )
        }
        loaded = {
          name,
          size,
          kind,
          bytes,
          text: kind === 'text' ? decodeText(bytes) : null,
          url,
        }
      })
      .catch(() => {
        if (!cancelled) error = 'Failed to load the solver file.'
      })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  })
  function download() {
    if (!loaded) return
    const url = URL.createObjectURL(
      new Blob([loaded.bytes as BlobPart], { type: 'application/octet-stream' })
    )
    const a = document.createElement('a')
    a.href = url
    a.download = loaded.name
    a.rel = 'noopener'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
</script>

<Dialog
  {open}
  {onOpenChange}
  title={loaded?.name ?? 'Solver file'}
  description={loaded ? formatFileSize(loaded.size) : undefined}
>
  {#snippet children()}
    <proof-preview>
      {#if error}<p role="alert">{error}</p>
      {:else if !loaded}<Spinner />
      {:else if loaded.kind === 'image' && loaded.url}<img
          src={loaded.url}
          alt="Solver file preview"
        />
      {:else if loaded.kind === 'video' && loaded.url}<!-- svelte-ignore a11y_media_has_caption --><video
          src={loaded.url}
          controls
        ></video>
      {:else if loaded.kind === 'audio' && loaded.url}<audio
          src={loaded.url}
          controls
        ></audio>
      {:else if loaded.kind === 'text' && loaded.text !== null}
        <pre><code>{loaded.text.slice(0, MAX_TEXT_PREVIEW_CHARS)}</code></pre>
        {#if loaded.text.length > MAX_TEXT_PREVIEW_CHARS}<p>
            Preview truncated. Download to see the full file.
          </p>{/if}
      {:else}<p>No preview available for this file type.</p>{/if}
      <Button variant="secondary" disabled={!loaded} onclick={download}
        >Download</Button
      >
    </proof-preview>
  {/snippet}
</Dialog>

<style>
  proof-preview {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
    min-inline-size: 0;
  }
  img,
  video {
    max-inline-size: 100%;
    max-block-size: 60vh;
    object-fit: contain;
  }
  audio {
    inline-size: 100%;
  }
  pre {
    max-block-size: 55vh;
    padding: var(--space-xs);
    overflow: auto;
    background: var(--background-l2);
    white-space: pre;
  }
</style>
