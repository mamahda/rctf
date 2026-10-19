import { toast } from '$lib/toast'

// navigator.clipboard is only available in secure contexts (HTTPS/localhost),
// so fall back to execCommand when the site is served over plain HTTP.
export async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  try {
    if (!document.execCommand('copy')) {
      throw new Error('Copy command failed')
    }
  } finally {
    textarea.remove()
  }
}

export async function copyText(
  text: string,
  successMessage: string,
  errorMessage = 'Failed to copy to clipboard'
): Promise<void> {
  try {
    await writeClipboard(text)
    toast.success(successMessage)
  } catch {
    toast.error(errorMessage)
  }
}
