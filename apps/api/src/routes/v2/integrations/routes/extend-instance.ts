import { ExtendInstanceRouteV2 } from '@rctf/types'
import { extendInstance } from '../../../../services/instance-lifecycle'
import integrationsGroup from '../group'

integrationsGroup.route(ExtendInstanceRouteV2, ({ ctx, res, params, user }) =>
  extendInstance({ res, db: ctx.var.db, user, participant: ctx.var.participant, challengeId: params.id })
)
