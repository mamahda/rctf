import { submissionProofs, type DatabaseClient } from '@rctf/db'
import { takeUnique } from '@rctf/db/util'
import type { FileField } from '@rctf/types'
import { eq } from 'drizzle-orm'

export type StoredProof = { sha256: string; name: string; size: number }

const DEFAULT_CONTENT_TYPE = 'application/octet-stream'

// Each submission has its own identifier so deletion cannot affect other submissions.
export const storeSubmissionProof = async (
  db: DatabaseClient,
  file: FileField
): Promise<StoredProof> => {
  const data = Buffer.from(await file.arrayBuffer())
  const sha256 = new Bun.SHA256().update(crypto.randomUUID()).digest('hex')

  await db.insert(submissionProofs).values({
    sha256,
    data,
    size: data.length,
    contentType: file.type || DEFAULT_CONTENT_TYPE,
  })

  return { sha256, name: file.name, size: data.length }
}

export const getSubmissionProof = (db: DatabaseClient, sha256: string) =>
  db
    .select()
    .from(submissionProofs)
    .where(eq(submissionProofs.sha256, sha256))
    .then(takeUnique)

export const deleteSubmissionProof = async (db: DatabaseClient, id: string) => {
  await db.delete(submissionProofs).where(eq(submissionProofs.sha256, id))
}
