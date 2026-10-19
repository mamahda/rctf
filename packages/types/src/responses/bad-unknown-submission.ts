import { response } from '../internal'

export const BadUnknownSubmission = response('badUnknownSubmission', {
  status: 404,
  message: 'The submission does not exist.',
})
