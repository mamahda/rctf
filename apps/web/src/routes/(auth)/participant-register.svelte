<script lang="ts">
  import { goto } from '$app/navigation'
  import Button from '$lib/ui/button.svelte'
  import Card from '$lib/ui/card.svelte'
  import Field from '$lib/ui/field.svelte'
  import Input from '$lib/ui/input.svelte'
  import Spinner from '$lib/ui/spinner.svelte'
  let nrp = $state('')
  let password = $state('')
  let confirmation = $state('')
  let error = $state('')
  let pending = $state(false)
  async function submit(event: SubmitEvent) {
    event.preventDefault()
    if (pending) return
    if (password !== confirmation) {
      error = 'Konfirmasi password tidak cocok.'
      return
    }
    pending = true
    error = ''
    try {
      const response = await fetch('/api/v2/participants/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nrp: nrp.trim(),
          password,
        }),
      })
      const body = await response.json()
      if (body.kind !== 'goodParticipantRegistered') {
        error = body.message || 'Pendaftaran gagal.'
        return
      }
      await goto('/login?registered=1')
    } catch {
      error = 'Tidak dapat menghubungi server. Coba lagi.'
    } finally {
      pending = false
    }
  }
</script>

<Card
  titleAsHeading
  title="Daftar peserta"
  description="Daftar dengan NRP yang telah didaftarkan ke panitia dan buat password sendiri."
>
  <auth-page>
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
      <Field label="Password" description="Gunakan 8–128 karakter." required
        >{#snippet children({ id, describedBy })}<Input
            {id}
            aria-describedby={describedBy}
            type="password"
            bind:value={password}
            minlength={8}
            maxlength={128}
            autocomplete="new-password"
            required
          />{/snippet}</Field
      >
      <Field label="Konfirmasi password" required
        >{#snippet children({ id, describedBy })}<Input
            {id}
            aria-describedby={describedBy}
            type="password"
            bind:value={confirmation}
            minlength={8}
            maxlength={128}
            autocomplete="new-password"
            required
          />{/snippet}</Field
      >
      {#if error}<p role="alert">{error}</p>{/if}
      <Button type="submit" disabled={pending}
        >{#if pending}<Spinner />{/if} Daftar</Button
      >
    </form>
    <footer-note>Sudah punya akun? <a href="/login">Login</a>.</footer-note>
  </auth-page>
</Card>
