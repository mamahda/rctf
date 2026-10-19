---
title: "`<route>POST</route>` Submit a flag"
description: "`<route>POST /api/[v2,v1]/challs/:id/submit</route>`"
order: 3
---

:::aside

::::tabs{sync="challs-submit-version"}

:::tab[V2]

::::route-example{def="SubmitFlagRouteV2" extra="BadBody"}

```json body
{
  "flag": "flag{example}",
  "aiChatLinks": "https://chatgpt.com/share/example",
  "solverFile": "@solve.py"
}
```

::::

:::

:::tab[V1]

::::route-example{def="SubmitFlagRoute" extra="BadJson,BadBody"}

```json body
{
  "flag": "flag{example}"
}
```

::::

:::

::::

:::

::route-meta{def="SubmitFlagRouteV2" rateLimit="Burst `5`, refill window `25000` ms, scoped to user and challenge."}

Submits a flag for the authenticated team. V2 takes multipart form-data so that it can carry the extra fields enabled by [`submissionFields`](/configuration#submission-fields): AI chat links (one per line, or `didNotUseAi` set to `true`) and a solver file. V1 takes JSON with only the flag, and returns `<response>400 badBody</response>` when any of those fields is required.

Rate limit conventions are documented under [`/api#rate-limits`](/api/#rate-limits).

::request-body{def="SubmitFlagRouteV2" source="params" title="Path parameters"}

::request-body{def="SubmitFlagRouteV2" title="Request body"}

A correct flag returns `<response>200 goodFlag</response>` (no data) and records a solve for the team. A submission is correct when any of the challenge's configured flag entries validates it. The route records a submission audit row for both correct and incorrect attempts; correct rows include which flag entry matched, along with the submitted AI chat links and the stored solver file. Admins can read those rows through [`/api/v2/admin/submissions`](/api/admin/).
