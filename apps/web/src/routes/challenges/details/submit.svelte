<script lang="ts">
  import {
    BadAlreadySolvedChallenge,
    BadBody,
    GoodFlag,
    SubmitFlagRouteV2,
    type Challenge,
  } from '@rctf/types'
  import { showApiError } from '$lib/api'
  import { useApiForm } from '$lib/forms/use-api-form.svelte'
  import {
    IconCheck,
    IconFile,
    IconInfo,
    IconPaperPlaneTilt,
    IconPlus,
    IconSignIn,
    IconX,
  } from '$lib/icons'
  import { useClientConfig } from '$lib/query/config'
  import { useCurrentUser } from '$lib/query/user'
  import { toast } from '$lib/toast'
  import Button from '$lib/ui/button.svelte'
  import Checkbox from '$lib/ui/checkbox.svelte'
  import Input from '$lib/ui/input.svelte'
  import Spinner from '$lib/ui/spinner.svelte'
  import { formatFileSize } from '$lib/utils/filesize'
  import { resolveSubmitState } from './submit-ladder'

  interface Props {
    challenge: Challenge
    isSolved: boolean
    onSolve: (challengeId: string) => void
  }

  let { challenge, isSolved, onSolve }: Props = $props()

  const configQuery = useClientConfig()
  const clientConfig = $derived(configQuery.data)
  const isArchived = $derived(clientConfig?.isArchived ?? false)
  const flagPlaceholder = $derived(
    clientConfig?.flagFormatPlaceholder ?? 'flag{...}'
  )

  const endTime = $derived(clientConfig?.endTime ?? Number.POSITIVE_INFINITY)

  const userQuery = useCurrentUser()
  const isAuthenticated = $derived(userQuery.data != null)

  let now = $state(Date.now())

  const submitState = $derived(
    resolveSubmitState({ isArchived, endTime, now, isAuthenticated, isSolved })
  )

  $effect(() => {
    if (submitState === 'archived' || submitState === 'ended') return
    const interval = setInterval(() => (now = Date.now()), 1000)
    return () => clearInterval(interval)
  })

  const MAX_AI_CHAT_LINKS = 10

  const aiChatLinksMode = $derived(
    clientConfig?.submissionFields.aiChatLinks ?? 'off'
  )
  const solverFileMode = $derived(
    clientConfig?.submissionFields.solverFile ?? 'off'
  )
  const maxSolverFileSize = $derived(
    clientConfig?.submissionFields.maxSolverFileSize ?? 0
  )

  let aiChatLinks = $state([''])
  let didNotUseAi = $state(false)
  let solverFile = $state<File | undefined>()
  let solverFileInput = $state<HTMLInputElement>()

  function resetExtras() {
    aiChatLinks = ['']
    didNotUseAi = false
    solverFile = undefined
    if (solverFileInput) solverFileInput.value = ''
  }

  const form = useApiForm(SubmitFlagRouteV2, {
    onSuccess: response => {
      if (response.kind === GoodFlag.kind) {
        toast.success('Flag correct!')
        onSolve(challenge.id)
        form.setData({ flag: '' })
        resetExtras()
      } else if (response.kind === BadAlreadySolvedChallenge.kind) {
        toast.info('You already solved this challenge')
        onSolve(challenge.id)
      }
    },
    onError: response => {
      if (response.kind === BadBody.kind) {
        toast.error(response.data.reason)
        return
      }
      showApiError(response)
    },
  })

  // mirrors normalizeSubmissionExtras on the API so most mistakes are caught
  // before the flag is sent
  function extrasError(links: string[]): string | null {
    if (aiChatLinksMode !== 'off') {
      if (links.some(link => !/^https?:\/\/\S+$/i.test(link))) {
        return 'Each AI chat link must be a valid HTTP(S) URL.'
      }
      if (aiChatLinksMode === 'required' && !didNotUseAi && !links.length) {
        return 'Add at least one AI chat link, or check "I did not use AI".'
      }
    }
    if (solverFileMode !== 'off') {
      if (solverFile && solverFile.size > maxSolverFileSize) {
        return `The solver file must be at most ${formatFileSize(maxSolverFileSize)}.`
      }
      if (solverFileMode === 'required' && !solverFile) {
        return 'Attach the solver file you used to get the flag.'
      }
    }
    return null
  }

  $effect(() => {
    form.data.id = challenge.id
  })

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    const flag = (form.data.flag ?? '').trim()
    if (!flag) return

    const links = didNotUseAi
      ? []
      : aiChatLinks.map(link => link.trim()).filter(Boolean)
    const error = extrasError(links)
    if (error) {
      toast.error(error)
      return
    }

    form.setData({
      flag,
      aiChatLinks:
        aiChatLinksMode !== 'off' && links.length
          ? links.join('\n')
          : undefined,
      didNotUseAi:
        aiChatLinksMode !== 'off' && didNotUseAi ? 'true' : undefined,
      solverFile: solverFileMode !== 'off' ? solverFile : undefined,
    })
    form.submit()
  }
</script>

<challenge-submit>
  {#if submitState === 'archived'}
    <submit-notice>
      <IconInfo />
      <span>The CTF is archived.</span>
    </submit-notice>
  {:else if submitState === 'ended'}
    <submit-notice>
      <IconInfo />
      <span>The CTF has ended.</span>
    </submit-notice>
  {:else if submitState === 'login'}
    <Button href="/login">
      <IconSignIn />
      Login to submit
    </Button>
  {:else}
    <form onsubmit={handleSubmit}>
      {#if submitState !== 'solved' && (aiChatLinksMode !== 'off' || solverFileMode !== 'off')}
        <submit-extras>
          {#if aiChatLinksMode !== 'off'}
            <extras-field>
              <extras-label>
                AI chat links
                {#if aiChatLinksMode === 'required'}<extras-required
                    aria-hidden="true">*</extras-required
                  >{/if}
              </extras-label>
              {#each aiChatLinks as _, i (i)}
                <link-row>
                  <Input
                    type="url"
                    placeholder="https://chatgpt.com/share/..."
                    autocomplete="off"
                    aria-label={`AI chat link ${i + 1}`}
                    disabled={form.submitting || didNotUseAi}
                    bind:value={aiChatLinks[i]}
                  />
                  {#if aiChatLinks.length > 1}
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove AI chat link ${i + 1}`}
                      disabled={form.submitting || didNotUseAi}
                      onclick={() => aiChatLinks.splice(i, 1)}
                    >
                      <IconX />
                    </Button>
                  {/if}
                </link-row>
              {/each}
              <extras-actions>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={form.submitting ||
                    didNotUseAi ||
                    aiChatLinks.length >= MAX_AI_CHAT_LINKS}
                  onclick={() => aiChatLinks.push('')}
                >
                  <IconPlus />
                  Add link
                </Button>
                <Checkbox bind:checked={didNotUseAi} disabled={form.submitting}
                  >I did not use AI</Checkbox
                >
              </extras-actions>
            </extras-field>
          {/if}
          {#if solverFileMode !== 'off'}
            <extras-field>
              <extras-label>
                Solver file
                {#if solverFileMode === 'required'}<extras-required
                    aria-hidden="true">*</extras-required
                  >{/if}
                <extras-hint
                  >max {formatFileSize(maxSolverFileSize)}</extras-hint
                >
              </extras-label>
              <input
                bind:this={solverFileInput}
                type="file"
                hidden
                onchange={event =>
                  (solverFile = event.currentTarget.files?.[0] ?? undefined)}
              />
              <file-row>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={form.submitting}
                  onclick={() => solverFileInput?.click()}
                >
                  <IconFile />
                  {solverFile ? 'Change file' : 'Choose file'}
                </Button>
                {#if solverFile}
                  <file-name title={solverFile.name}>
                    {solverFile.name} ({formatFileSize(solverFile.size)})
                  </file-name>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Remove solver file"
                    disabled={form.submitting}
                    onclick={() => {
                      solverFile = undefined
                      if (solverFileInput) solverFileInput.value = ''
                    }}
                  >
                    <IconX />
                  </Button>
                {/if}
              </file-row>
            </extras-field>
          {/if}
        </submit-extras>
      {/if}
      <submit-row>
        {#if submitState === 'solved'}
          <submit-notice data-tone="success">
            <IconCheck />
            <span>Challenge solved!</span>
          </submit-notice>
        {:else}
          <Input
            type="text"
            placeholder={flagPlaceholder}
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
            data-flag-input
            aria-label="Flag"
            aria-invalid={!!form.errors._form || undefined}
            disabled={form.submitting}
            bind:value={form.data.flag}
          />
        {/if}
        <button
          type="submit"
          aria-label="Submit flag"
          disabled={form.submitting || submitState === 'solved'}
        >
          {#if form.submitting}
            <Spinner />
          {:else}
            <IconPaperPlaneTilt />
          {/if}
        </button>
      </submit-row>
    </form>
  {/if}
</challenge-submit>

<style>
  challenge-submit {
    display: block;
    --submit-block-size: 3rem;

    :global(a[data-variant]) {
      gap: 0.5rem;
      inline-size: 100%;
      block-size: var(--submit-block-size);
      font-size: 1.25rem;
    }
  }

  form {
    display: block;
  }

  submit-extras {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    margin-block-end: var(--space-xs);
  }

  extras-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
  }

  extras-label {
    display: flex;
    align-items: baseline;
    gap: var(--space-3xs);
    color: var(--foreground-l2);
    font-size: var(--step--1);
  }

  extras-required {
    color: var(--foreground-destructive);
  }

  extras-hint {
    color: var(--foreground-l4);
    font-size: var(--step--2);
  }

  link-row,
  file-row,
  extras-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
  }

  link-row :global(input) {
    flex: 1;
    min-inline-size: 0;
  }

  extras-actions {
    justify-content: space-between;
    flex-wrap: wrap;
  }

  file-name {
    min-inline-size: 0;
    overflow: hidden;
    color: var(--foreground-l2);
    font-size: var(--step--1);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  submit-row {
    display: flex;
    align-items: stretch;
    gap: 0.5rem;
    block-size: var(--submit-block-size);

    :global(input[data-flag-input]) {
      flex: 1;
      min-inline-size: 0;
      block-size: var(--submit-block-size);
      font-family: var(--font-mono);
      font-size: 1.25rem;
      border-radius: var(--radius-lg);

      &:disabled {
        cursor: not-allowed;
        opacity: 0.5;
      }
    }
  }

  submit-notice {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 0.75rem;
    min-inline-size: 0;
    block-size: var(--submit-block-size);
    padding-inline: 0.75rem;
    font-size: 1.25rem;
    color: var(--foreground-l3);
    background: var(--background-l4);
    border-radius: var(--radius-lg);

    &[data-tone='success'] {
      color: var(--foreground-success);
      background: var(--background-success);
    }

    span {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    :global(svg) {
      flex-shrink: 0;
      inline-size: 1.5rem;
      block-size: 1.5rem;
    }
  }

  button {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    padding-inline: 1rem;
    block-size: var(--submit-block-size);
    color: var(--foreground-l4);
    background: var(--background-l4);
    cursor: pointer;
    border-radius: var(--radius-lg);

    &:hover:enabled {
      background: var(--background-l5);
    }

    &:focus-visible {
      outline: 2px solid var(--ring);
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }

    :global(svg) {
      inline-size: 1.5rem;
      block-size: 1.5rem;
    }
  }
</style>
