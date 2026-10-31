import { z } from 'zod/mini'
import { response } from '../internal'

export const BadNoProof = response('badNoProof', {
  status: 404,
  message: 'This submission has no solver proof.',
})
export const GoodSubmissionProof = response('goodSubmissionProof', {
  status: 200,
  message: 'The solver proof was retrieved.',
  data: z.object({
    name: z.string(),
    size: z.int(),
    contentType: z.string(),
    data: z.string(),
  }),
})
