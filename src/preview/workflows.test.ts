import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

type Step = { name?: string; env?: Record<string, string>; if?: string; uses?: string; with?: Record<string, string> }
type Workflow = {
  on: { workflow_call: { inputs: { domain: { default?: string } } } }
  env?: Record<string, string>
  jobs: Record<
    string,
    { if?: string; concurrency?: { group?: string; 'cancel-in-progress'?: boolean }; steps?: Step[]; with?: Record<string, string> }
  >
}

describe('Dokploy preview workflows', () => {
  it('routes custom and generated preview URLs through every deployment consumer', async () => {
    const build = await workflow('build-dokploy-preview.yml')
    const deploy = await workflow('deploy-dokploy-preview.yml')
    const prune = await workflow('prune-dokploy-previews.yml')

    expect({
      defaults: [build, deploy, prune].map((candidate) => candidate.on.workflow_call.inputs.domain.default),
      customUrl: deploy.env?.CUSTOM_PREVIEW_URL,
      buildingUrl: step(build, 'mark-deploying', 'Mark preview as deploying').env?.PREVIEW_URL,
      forkAwaitingUrl: deploy.jobs['mark-fork-awaiting-approval']?.with?.['preview-url'],
      forkDeployingUrl: deploy.jobs['mark-fork-deploying']?.with?.['preview-url'],
      browserUrl: step(deploy, 'deploy', 'Verify preview').env?.PREVIEW_BASE_URL,
      readyUrl: step(deploy, 'deploy', 'Mark preview as ready').env?.PREVIEW_URL,
      failedUrl: step(deploy, 'deploy', 'Mark preview as failed').env?.PREVIEW_URL,
      deployConcurrency: deploy.jobs.deploy?.concurrency,
      reconcileEvents: deploy.jobs.deploy?.if,
      stateCheck: step(deploy, 'deploy', 'Resolve pull request state'),
      openDeploy: step(deploy, 'deploy', 'Deploy preview').if,
      closedCleanup: step(deploy, 'deploy', 'Delete closed preview').if,
      closedStatus: step(deploy, 'deploy', 'Mark closed preview as deleted').if,
      closedImages: step(deploy, 'deploy', 'Delete closed preview images').if,
    }).toEqual({
      defaults: ['', '', ''],
      customUrl:
        "${{ inputs.domain != '' && format('https://pr-{0}.{1}', github.event.workflow_run.pull_requests[0].number || github.event.pull_request.number, inputs.domain) || '' }}",
      buildingUrl: "${{ inputs.domain != '' && format('https://pr-{0}.{1}', github.event.pull_request.number, inputs.domain) || '' }}",
      forkAwaitingUrl:
        "${{ inputs.domain != '' && format('https://pr-{0}.{1}', github.event.workflow_run.pull_requests[0].number, inputs.domain) || '' }}",
      forkDeployingUrl:
        "${{ inputs.domain != '' && format('https://pr-{0}.{1}', github.event.workflow_run.pull_requests[0].number, inputs.domain) || '' }}",
      browserUrl: '${{ steps.deploy.outputs.preview-url || env.CUSTOM_PREVIEW_URL }}',
      readyUrl: '${{ steps.deploy.outputs.preview-url || env.CUSTOM_PREVIEW_URL }}',
      failedUrl: '${{ steps.deploy.outputs.preview-url || env.CUSTOM_PREVIEW_URL }}',
      deployConcurrency: {
        group:
          'dokploy-${{ github.repository }}-${{ inputs.application-prefix }}-pr-${{ github.event.workflow_run.pull_requests[0].number || github.event.pull_request.number }}',
        'cancel-in-progress': false,
      },
      reconcileEvents:
        "(github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.pull_requests[0]) || github.event_name == 'pull_request_target'",
      stateCheck: expect.objectContaining({
        env: expect.objectContaining({
          PR_NUMBER: '${{ github.event.workflow_run.pull_requests[0].number || github.event.pull_request.number }}',
        }),
      }),
      openDeploy: "steps.pr.outputs.state == 'open'",
      closedCleanup: "steps.pr.outputs.state == 'closed'",
      closedStatus: "steps.pr.outputs.state == 'closed'",
      closedImages: "steps.pr.outputs.state == 'closed'",
    })
  })
})

async function workflow(name: string) {
  return parse(await readFile(new URL(`../../.github/workflows/${name}`, import.meta.url), 'utf8')) as Workflow
}

function step(definition: Workflow, job: string, name: string) {
  const found = definition.jobs[job]?.steps?.find((candidate) => candidate.name === name)
  if (!found) throw new Error(`${job} is missing ${name}`)
  return found
}
