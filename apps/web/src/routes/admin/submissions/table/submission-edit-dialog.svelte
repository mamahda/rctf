<script lang="ts">
  import {
    BadBody,
    GoodAdminSubmissionUpdated,
    UpdateAdminSubmissionRouteV2,
  } from '@rctf/types'
  import { useQueryClient } from '@tanstack/svelte-query'
  import { apiRequest, showApiError } from '$lib/api'
  import { toast } from '$lib/toast'
  import Button from '$lib/ui/button.svelte'
  import Checkbox from '$lib/ui/checkbox.svelte'
  import Dialog from '$lib/ui/dialog.svelte'
  import Field from '$lib/ui/field.svelte'
  import Spinner from '$lib/ui/spinner.svelte'
  import Textarea from '$lib/ui/textarea.svelte'
  import { untrack } from 'svelte'
  import {
    parseSubmissionLinks,
    submissionExtrasForm,
    type Submission,
  } from '../submissions-model'

  type Props = {
    open: boolean
    onOpenChange: (open: boolean) => void
    submission: Submission
  }

  let { open, onOpenChange, submission }: Props = $props()

  const queryClient = useQueryClient()

  let form = $state(untrack(() => submissionExtrasForm(submission)))
  let saving = $state(false)

  // start from the stored values every time the dialog opens, but leave the
  // form alone when a refetch hands in a new submission object while editing
  let wasOpen = false
  $effect(() => {
    if (open && !wasOpen) {
      form = untrack(() => submissionExtrasForm(submission))
    }
    wasOpen = open
  })

  const links = $derived(parseSubmissionLinks(form.aiChatLinks))
  const linksError = $derived(
    links.length > 10
      ? 'At most 10 links.'
      : links.some(link => !/^https?:\/\/\S+$/i.test(link))
        ? 'Each link must be an HTTP(S) URL.'
        : form.didNotUseAi && links.length > 0
          ? 'Clear the links or uncheck "did not use AI".'
          : null
  )

  async function save(event: SubmitEvent) {
    event.preventDefault()
    if (linksError || saving) return

    saving = true
    try {
      const response = await apiRequest(UpdateAdminSubmissionRouteV2, {
        id: submission.id,
        aiChatLinks: links,
        didNotUseAi: form.didNotUseAi,
        adminNote: form.adminNote.trim() || null,
        ...(form.removeSolverFile ? { removeSolverFile: true as const } : {}),
      })
      if (response.kind === GoodAdminSubmissionUpdated.kind) {
        toast.success('Submission updated')
        await queryClient.invalidateQueries({
          queryKey: ['admin', 'submissions'],
        })
        onOpenChange(false)
      } else if (response.kind === BadBody.kind) {
        toast.error(response.data.reason)
      } else {
        showApiError(response)
      }
    } finally {
      saving = false
    }
  }
</script>

<Dialog
  {open}
  {onOpenChange}
  title="Edit submission"
  description="Only the extra submission fields can be changed. The result and the flag stay as recorded."
>
  {#snippet children({ closeProps })}
    <form onsubmit={save}>
      <Field
        label="AI chat links"
        description="One HTTP(S) URL per line."
        error={linksError}
      >
        {#snippet children({ id, describedBy })}
          <Textarea
            {id}
            aria-describedby={describedBy}
            aria-invalid={!!linksError || undefined}
            rows={3}
            placeholder="https://chatgpt.com/share/..."
            disabled={saving}
            bind:value={form.aiChatLinks}
          />
        {/snippet}
      </Field>
      <Checkbox bind:checked={form.didNotUseAi} disabled={saving}
        >Team declared that they did not use AI</Checkbox
      >
      <Field label="Admin note" description="Visible to admins only.">
        {#snippet children({ id, describedBy })}
          <Textarea
            {id}
            aria-describedby={describedBy}
            rows={3}
            maxlength={2000}
            disabled={saving}
            bind:value={form.adminNote}
          />
        {/snippet}
      </Field>
      {#if form.hasSolverFile}
        <Checkbox bind:checked={form.removeSolverFile} disabled={saving}
          >Delete the stored solver file</Checkbox
        >
      {/if}
      <edit-actions>
        <Button {...closeProps} variant="secondary" disabled={saving}
          >Cancel</Button
        >
        <Button type="submit" disabled={saving || !!linksError}>
          {#if saving}<Spinner />{/if}
          Save
        </Button>
      </edit-actions>
    </form>
  {/snippet}
</Dialog>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
  }

  edit-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2xs);
  }
</style>
