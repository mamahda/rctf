import { SubmitFlagRouteV2 } from '@rctf/types'
import { submitFlag } from '../../../../services/challenges'
import {
  normalizeSubmissionExtras,
  parseAiChatLinks,
} from '../../../../services/submission-extras'
import challsGroup from '../group'

challsGroup.route(
  SubmitFlagRouteV2,
  async ({ res, ctx, params, body, user }) => {
    const normalized = normalizeSubmissionExtras({
      aiChatLinks: parseAiChatLinks(body.aiChatLinks),
      didNotUseAi: body.didNotUseAi === 'true',
      solverFile: body.solverFile,
    })
    if (!normalized.ok) {
      return res.badBody({ reason: normalized.reason })
    }

    return await submitFlag(res, ctx.var.db, ctx.var.redis, ctx.var.logger, {
      userId: user.id,
      challengeId: params.id,
      flag: body.flag,
      submissionIp: ctx.var.ip,
      extras: normalized.extras,
    })
  }
)
