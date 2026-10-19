import { UpdateAdminSubmissionRouteV2 } from '@rctf/types'
import { updateSubmissionExtras } from '../../../../services/submission-extras'
import adminGroup from '../group'

adminGroup.route(
  UpdateAdminSubmissionRouteV2,
  async ({ res, ctx, params, body, user }) => {
    const result = await updateSubmissionExtras(ctx.var.db, {
      id: params.id,
      adminId: user.id,
      patch: body,
    })

    if (!result.ok) {
      if (result.error === 'unknownSubmission') {
        return res.badUnknownSubmission()
      }
      return res.badBody({
        reason:
          'A submission cannot both list AI chat links and declare that no AI was used.',
      })
    }

    return res.goodAdminSubmissionUpdated({ details: result.details })
  }
)
