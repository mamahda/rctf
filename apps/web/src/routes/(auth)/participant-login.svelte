<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { setToken } from '$lib/api'
  import Button from '$lib/ui/button.svelte'
  import Card from '$lib/ui/card.svelte'
  import Field from '$lib/ui/field.svelte'
  import Input from '$lib/ui/input.svelte'
  import Spinner from '$lib/ui/spinner.svelte'
  let nrp = $state('')
  let password = $state('')
  let error = $state('')
  let pending = $state(false)
  async function submit(event: SubmitEvent) {
    event.preventDefault()
    if (pending) return
    pending = true
    error = ''
    try {
      const response = await fetch('/api/v2/participants/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nrp: nrp.trim(), password }),
      })
      const body = await response.json()
      if (body.kind !== 'goodParticipantLogin') {
        error = body.message || 'Login gagal.'
        return
      }
      if (body.data.joined) {
        setToken(body.data.token)
        await goto('/challenges')
      } else {
        sessionStorage.setItem('participantPendingToken', body.data.token)
        await goto('/join')
      }
    } catch {
      error = 'Tidak dapat menghubungi server. Coba lagi.'
    } finally {
      pending = false
    }
  }
</script>

<Card
  titleAsHeading
  title="Login peserta"
  description="Masuk dengan akun peserta Quadrathlon CTF."
>
  <auth-page>
    {#if page.url.searchParams.get('registered') === '1'}
      <p role="status">Akun berhasil dibuat. Silakan login.</p>
    {/if}
    <form onsubmit={submit}>
      <Field label="NRP" required
        >{#snippet children({ id, describedBy })}<Input
            {id}
            aria-describedby={describedBy}
            bind:value={nrp}
            inputmode="numeric"
            autocomplete="username"
            required
          />{/snippet}</Field
      >
      <Field label="Password" required
        >{#snippet children({ id, describedBy })}<Input
            {id}
            aria-describedby={describedBy}
            type="password"
            bind:value={password}
            autocomplete="current-password"
            required
          />{/snippet}</Field
      >
      {#if error}<p role="alert">{error}</p>{/if}
      <Button type="submit" disabled={pending}
        >{#if pending}<Spinner />{/if} Login</Button
      >
    </form>
    <footer-note
      >Belum punya akun? <a href="/register">Daftar sebagai peserta</a
      >.</footer-note
    >
  </auth-page>
</Card>
