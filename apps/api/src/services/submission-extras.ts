import { config } from '@rctf/config'
import {
  submissions,
  submissionProofs,
  type DatabaseClient,
  type SubmissionDetails,
} from '@rctf/db'
import { takeUnique } from '@rctf/db/util'
import { isHttpUrl, SubmissionKind, type FileField } from '@rctf/types'
import { eq } from 'drizzle-orm'
import { uploadProvider } from '../providers/instances/uploads'
import { storeSubmissionProof } from './submission-proofs'

const MAX_AI_CHAT_LINKS = 10
const MAX_AI_CHAT_LINK_LENGTH = 2048

export interface SubmissionExtras {
  aiChatLinks: string[]
  didNotUseAi: boolean
  solverFile: FileField | undefined
}

export interface StoredSolverFile {
  name: string
  url?: string
  sha256?: string
  size: number
}

export const NO_SUBMISSION_EXTRAS: SubmissionExtras = {
  aiChatLinks: [],
  didNotUseAi: false,
  solverFile: undefined,
}

export const submissionExtrasRequired = (): boolean =>
  config.submissionFields.aiChatLinks === 'required' ||
  config.submissionFields.solverFile === 'required'

export const parseAiChatLinks = (raw: string | undefined): string[] =>
  (raw ?? '')
    .split(/\r?\n/)
    .map(link => link.trim())
    .filter(Boolean)

// Drops the fields that are turned off and checks the rest against the
// config, returning the reason to report as badBody when they don't fit
export const normalizeSubmissionExtras = (
  extras: SubmissionExtras
): { ok: true; extras: SubmissionExtras } | { ok: false; reason: string } => {
  const fields = config.submissionFields
  const normalized: SubmissionExtras = { ...NO_SUBMISSION_EXTRAS }

  if (fields.aiChatLinks !== 'off') {
    const links = extras.aiChatLinks
    if (links.length > MAX_AI_CHAT_LINKS) {
      return {
        ok: false,
        reason: `Provide at most ${MAX_AI_CHAT_LINKS} AI chat links.`,
      }
    }
    if (
      links.some(
        link => link.length > MAX_AI_CHAT_LINK_LENGTH || !isHttpUrl(link)
      )
    ) {
      return {
        ok: false,
        reason: 'Each AI chat link must be a valid HTTP(S) URL.',
      }
    }
    if (extras.didNotUseAi && links.length > 0) {
      return {
        ok: false,
        reason: 'Either provide AI chat links or declare that no AI was used.',
      }
    }
    if (
      fields.aiChatLinks === 'required' &&
      links.length === 0 &&
      !extras.didNotUseAi
    ) {
      return {
        ok: false,
        reason:
          'Provide at least one AI chat link or declare that no AI was used.',
      }
    }
    normalized.aiChatLinks = links
    normalized.didNotUseAi = extras.didNotUseAi
  }

  if (fields.solverFile !== 'off') {
    const file = extras.solverFile?.size ? extras.solverFile : undefined
    if (file && file.size > fields.maxSolverFileSize) {
      return {
        ok: false,
        reason: `The solver file must be at most ${fields.maxSolverFileSize} bytes.`,
      }
    }
    if (fields.solverFile === 'required' && !file) {
      return { ok: false, reason: 'A solver file is required.' }
    }
    normalized.solverFile = file
  }

  return { ok: true, extras: normalized }
}

export const storeSolverFile = async (
  db: DatabaseClient,
  file: FileField
): Promise<{ stored: StoredSolverFile }> => ({
  stored: await storeSubmissionProof(db, file),
})

export const submissionExtrasDetails = (
  extras: SubmissionExtras,
  solverFile?: StoredSolverFile
): Record<string, unknown> => ({
  ...(extras.aiChatLinks.length > 0 ? { aiChatLinks: extras.aiChatLinks } : {}),
  ...(extras.didNotUseAi ? { didNotUseAi: true } : {}),
  ...(solverFile ? { solverFile } : {}),
})

export interface SubmissionExtrasPatch {
  aiChatLinks?: string[]
  didNotUseAi?: boolean
  adminNote?: string | null
  removeSolverFile?: true
}

const setOrDelete = (
  details: SubmissionDetails,
  key: string,
  value: unknown
): void => {
  if (value === undefined) {
    delete details[key]
  } else {
    details[key] = value
  }
}

export const updateSubmissionExtras = async (
  db: DatabaseClient,
  params: { id: string; adminId: string; patch: SubmissionExtrasPatch }
): Promise<
  | { ok: true; details: SubmissionDetails }
  | { ok: false; error: 'unknownSubmission' | 'conflictingAiFields' }
> => {
  const { patch } = params
  const result = await db.transaction(async tx => {
    const row = await tx
      .select({ kind: submissions.kind, details: submissions.details })
      .from(submissions)
      .where(eq(submissions.id, params.id))
      .limit(1)
      .for('update')
      .then(takeUnique)
    if (!row || row.kind !== SubmissionKind.FLAG) {
      return { ok: false, error: 'unknownSubmission' } as const
    }

    const details: SubmissionDetails = { ...row.details }
    if (patch.aiChatLinks !== undefined) {
      setOrDelete(
        details,
        'aiChatLinks',
        patch.aiChatLinks.length > 0 ? patch.aiChatLinks : undefined
      )
    }
    if (patch.didNotUseAi !== undefined) {
      setOrDelete(details, 'didNotUseAi', patch.didNotUseAi || undefined)
    }
    if (
      details.didNotUseAi === true &&
      Array.isArray(details.aiChatLinks) &&
      details.aiChatLinks.length > 0
    ) {
      return { ok: false, error: 'conflictingAiFields' } as const
    }
    if (patch.adminNote !== undefined) {
      setOrDelete(details, 'adminNote', patch.adminNote?.trim() || undefined)
    }

    let removedSolverFileUrl: string | undefined
    const solverFile = details.solverFile as Partial<StoredSolverFile> | null
    if (patch.removeSolverFile && solverFile) {
      removedSolverFileUrl = solverFile.url
      if (solverFile.sha256) {
        await tx
          .delete(submissionProofs)
          .where(eq(submissionProofs.sha256, solverFile.sha256))
      }
      delete details.solverFile
    }

    details.adminEditedBy = params.adminId
    details.adminEditedAt = new Date().toISOString()

    await tx
      .update(submissions)
      .set({ details })
      .where(eq(submissions.id, params.id))
    return { ok: true, details, removedSolverFileUrl } as const
  })

  if (!result.ok) {
    return result
  }
  // after the commit, so a rolled back update never loses the file
  if (result.removedSolverFileUrl) {
    await uploadProvider.deleteFileByUrl(result.removedSolverFileUrl)
  }
  return { ok: true, details: result.details }
}
