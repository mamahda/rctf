import { z } from 'zod/mini'
import { response } from '../internal'
import { example } from '../util/example'

export const GoodAdminSubmissionUpdated = response(
  'goodAdminSubmissionUpdated',
  {
    status: 200,
    message: 'The submission was updated.',
    data: z.object({
      details: example(z.record(z.string(), z.any()), {
        submittedFlag: 'flag{example}',
        aiChatLinks: ['https://chatgpt.com/share/example'],
        adminNote: 'Checked the chat, looks legitimate.',
      }).check(z.describe('Submission details after the update.')),
    }),
  }
)
