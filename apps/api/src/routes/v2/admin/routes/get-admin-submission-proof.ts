import { submissions } from '@rctf/db'
import { takeUnique } from '@rctf/db/util'
import { GetAdminSubmissionProofRouteV2 } from '@rctf/types'
import { eq } from 'drizzle-orm'
import { getSubmissionProof } from '../../../../services/submission-proofs'
import adminGroup from '../group'

type ProofRef = { sha256?: unknown; name?: unknown }

adminGroup.route(
  GetAdminSubmissionProofRouteV2,
  async ({ ctx, res, params }) => {
    const submission = await ctx.var.db
      .select({ details: submissions.details })
      .from(submissions)
      .where(eq(submissions.id, params.id))
      .then(takeUnique)
    if (!submission) {
      return res.badUnknownSubmission()
    }

    const ref = submission.details.solverFile as ProofRef | undefined
    if (!ref || typeof ref.sha256 !== 'string') {
      return res.badNoProof()
    }

    const proof = await getSubmissionProof(ctx.var.db, ref.sha256)
    if (!proof) {
      return res.badNoProof()
    }

    return res.goodSubmissionProof({
      name: typeof ref.name === 'string' ? ref.name : 'proof',
      size: proof.size,
      contentType: proof.contentType,
      data: proof.data.toString('base64'),
    })
  }
)
