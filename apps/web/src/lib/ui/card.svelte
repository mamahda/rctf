<script lang="ts">
  import type { Snippet } from 'svelte'

  type Props = {
    title?: string
    description?: string
    titleAsHeading?: boolean
    children: Snippet
  }

  let { title, description, titleAsHeading = false, children }: Props = $props()
</script>

<ui-card>
  {#if title || description}
    <card-header>
      {#if title}
        {#if titleAsHeading}<h1>{title}</h1>{:else}<card-title
            >{title}</card-title
          >{/if}
      {/if}
      {#if description}
        <card-description>{description}</card-description>
      {/if}
    </card-header>
  {/if}
  {@render children()}
</ui-card>

<style>
  ui-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
    padding: var(--space-s-m);
    background: var(--background-l1);
    border-radius: var(--radius-lg);
  }

  card-header {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
  }

  card-title,
  h1 {
    display: block;
    margin: 0;
    font-weight: inherit;
    line-height: inherit;
    font-size: var(--step-1);
  }

  card-description {
    display: block;
    font-size: var(--step--1);
    color: var(--foreground-l3);
  }
</style>
