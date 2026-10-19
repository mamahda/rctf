import { config } from '@rctf/config'
import { defineCommand } from 'citty'

// room for the flag, the AI chat links and the multipart framing
const MULTIPART_OVERHEAD = 64 * 1024

export default defineCommand({
  meta: {
    name: 'generate-submission-body-limit',
    description:
      'Generate the nginx client_max_body_size directive for flag submissions',
  },
  run: () => {
    const solverFileSize =
      config.submissionFields.solverFile === 'off'
        ? 0
        : config.submissionFields.maxSolverFileSize
    process.stdout.write(
      `client_max_body_size ${solverFileSize + MULTIPART_OVERHEAD};\n`
    )
  },
})
