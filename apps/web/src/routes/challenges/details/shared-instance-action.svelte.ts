import { createAsyncAction } from '$lib/utils/async-action.svelte'

// Keep in-flight actions alive across challenge navigation.
const actions = new Map<string, ReturnType<typeof createAsyncAction<string>>>()

export function getSharedInstanceAction(challengeId: string, admin: boolean) {
  const key = `${admin ? 'admin' : 'participant'}:${challengeId}`
  let action = actions.get(key)
  if (!action) {
    action = createAsyncAction<string>()
    actions.set(key, action)
  }
  return action
}
