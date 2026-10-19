---
title: "`<route>PATCH</route>` Update a submission"
description: "`<route>PATCH /api/v2/admin/submissions/:id</route>`"
order: 19
---

:::aside

::::route-example{def="UpdateAdminSubmissionRouteV2" extra="BadJson"}

```json body
{
  "aiChatLinks": ["https://chatgpt.com/share/example"],
  "adminNote": "Checked the chat, looks legitimate."
}
```

```json params
{
  "id": "submission-id"
}
```

::::

:::

::route-meta{def="UpdateAdminSubmissionRouteV2"}

This route changes the fields collected through [`submissionFields`](/configuration#submission-fields) on a flag submission, and keeps a note for other admins. Omitted fields stay as they are; an empty `aiChatLinks` array or a `null` `adminNote` removes them. `removeSolverFile` deletes the stored file from the upload provider.

The result and the submitted flag can't be changed, since solves and scores were derived from them. Every update records the editing admin as `adminEditedBy` and the time as `adminEditedAt` in the submission details. Listing AI chat links while `didNotUseAi` is set returns `<response>400 badBody</response>`, and submissions that aren't flag submissions return `<response>404 badUnknownSubmission</response>`.

::request-body{def="UpdateAdminSubmissionRouteV2" source="params" title="Path parameters"}

::request-body{def="UpdateAdminSubmissionRouteV2" title="Request body"}

::response-body{def="UpdateAdminSubmissionRouteV2" response="goodAdminSubmissionUpdated" title="Response fields"}
