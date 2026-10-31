<script lang="ts">
  import { goto } from '$app/navigation'
  import { setToken } from '$lib/api'
  import Button from '$lib/ui/button.svelte'
  import Card from '$lib/ui/card.svelte'
  import Field from '$lib/ui/field.svelte'
  import Input from '$lib/ui/input.svelte'
  import Spinner from '$lib/ui/spinner.svelte'
  import { onMount } from 'svelte'
  let token = ''
  let teamToken = $state('')
  let error = $state('')
  let pending = $state(false)
  onMount(() => {
    token = sessionStorage.getItem('participantPendingToken') ?? ''
    if (!token) void goto('/login')
  })
  async function submit(event: SubmitEvent) {
    event.preventDefault()
    if (pending || !token) return
    pending = true
    error = ''
    try {
      const response = await fetch('/api/v2/participants/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ teamToken: teamToken.trim() }),
      })
      const body = await response.json()
      if (body.kind !== 'goodParticipantJoined') {
        error = body.message || 'Tidak dapat bergabung ke tim.'
        return
      }
      sessionStorage.removeItem('participantPendingToken')
      setToken(token)
      await goto('/challenges')
    } catch {
      error = 'Tidak dapat menghubungi server. Coba lagi.'
    } finally {
      pending = false
    }
  }
</script>

<Card
  titleAsHeading
  title="Bergabung ke tim"
  description="Masukkan kode tim dari panitia untuk bergabung ke tim yang sudah ditetapkan."
>
  <auth-page
    ><form onsubmit={submit}>
      <Field label="Kode tim" required
        >{#snippet children({ id, describedBy })}<Input
            {id}
            aria-describedby={describedBy}
            bind:value={teamToken}
            autocomplete="off"
            required
          />{/snippet}</Field
      >
      {#if error}<p role="alert">{error}</p>{/if}
      <Button type="submit" disabled={pending}
        >{#if pending}<Spinner />{/if} Gabung tim</Button
      >
    </form></auth-page
  >
</Card>
