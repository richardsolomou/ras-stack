import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

type Step = { name?: string; env?: Record<string, string>; if?: string; run?: string; uses?: string; with?: Record<string, string> }
type Workflow = {
  on: { workflow_call: { inputs: Record<string, { default?: string }> } }
  env?: Record<string, string>
  jobs: Record<
    string,
    {
      if?: string
      environment?: string
      concurrency?: { group?: string; 'cancel-in-progress'?: boolean }
      permissions?: Record<string, string>
      steps?: Step[]
      with?: Record<string, string>
    }
  >
}

describe('Dokploy preview workflows', () => {
  it('routes custom and generated preview URLs through every deployment consumer', async () => {
    const build = await workflow('build-dokploy-preview.yml')
    const deploy = await workflow('deploy-dokploy-preview.yml')
    const prune = await workflow('prune-dokploy-previews.yml')

    expect({
      defaults: [build, deploy, prune].map((candidate) => candidate.on.workflow_call.inputs.domain?.default),
      prefixDefaults: [build, deploy, prune].map((candidate) => candidate.on.workflow_call.inputs['subdomain-prefix']?.default),
      customUrl: deploy.env?.CUSTOM_PREVIEW_URL,
      buildingUrl: step(build, 'mark-deploying', 'Mark preview as deploying').env?.PREVIEW_URL,
      forkUrl: step(deploy, 'mark-fork-status', 'Report fork preview status').env?.PREVIEW_URL,
      forkState: step(deploy, 'mark-fork-status', 'Report fork preview status').env?.STATE,
      forkStatusScript: step(deploy, 'mark-fork-status', 'Report fork preview status').run,
      forkStatusPermissions: deploy.jobs['mark-fork-status']?.permissions,
      browserUrl: step(deploy, 'deploy', 'Verify preview').env?.PREVIEW_BASE_URL,
      readyUrl: step(deploy, 'deploy', 'Mark preview as ready').env?.PREVIEW_URL,
      failedUrl: step(deploy, 'deploy', 'Mark preview as failed').env?.PREVIEW_URL,
      dependabotEnvironmentDefault: deploy.on.workflow_call.inputs['dependabot-environment']?.default,
      deployEnvironment: deploy.jobs.deploy?.environment,
      deployConcurrency: deploy.jobs.deploy?.concurrency,
      reconcileEvents: deploy.jobs.deploy?.if,
      stateCheck: step(deploy, 'deploy', 'Resolve pull request state'),
      openDeploy: step(deploy, 'deploy', 'Deploy preview').if,
      closedCleanup: step(deploy, 'deploy', 'Delete closed preview').if,
      closedStatus: step(deploy, 'deploy', 'Mark closed preview as deleted').if,
      closedImages: step(deploy, 'deploy', 'Delete closed preview images').if,
      deployDns: step(deploy, 'deploy', 'Deploy preview').env,
      deleteDns: step(deploy, 'deploy', 'Delete closed preview').env,
      pruneDns: step(prune, 'prune', 'Prune previews without open pull requests').env,
    }).toEqual({
      defaults: ['', '', ''],
      prefixDefaults: ['pr', 'pr', 'pr'],
      customUrl:
        "${{ inputs.domain != '' && format('https://{0}-{1}.{2}', inputs.subdomain-prefix, github.event.workflow_run.pull_requests[0].number || github.event.pull_request.number, inputs.domain) || '' }}",
      buildingUrl:
        "${{ inputs.domain != '' && format('https://{0}-{1}.{2}', inputs.subdomain-prefix, github.event.pull_request.number, inputs.domain) || '' }}",
      forkUrl:
        "${{ inputs.domain != '' && format('https://{0}-{1}.{2}', inputs.subdomain-prefix, github.event.workflow_run.pull_requests[0].number, inputs.domain) || '' }}",
      forkState: "${{ github.event.action == 'requested' && 'awaiting' || 'building' }}",
      forkStatusScript: expect.stringMatching(
        /pulls\/\$PR_NUMBER.*head\.sha[\s\S]*actions\/runs\/\$WORKFLOW_RUN_ID[\s\S]*pr_state.*open.*head_sha.*COMMIT_SHA.*run_status.*completed[\s\S]*ras preview.*STATE[\s\S]*pulls\/\$PR_NUMBER[\s\S]*closed[\s\S]*ras preview deleted/,
      ),
      forkStatusPermissions: { actions: 'read', checks: 'write', contents: 'read', issues: 'write', 'pull-requests': 'write' },
      browserUrl: '${{ steps.deploy.outputs.preview-url || env.CUSTOM_PREVIEW_URL }}',
      readyUrl: '${{ steps.deploy.outputs.preview-url || env.CUSTOM_PREVIEW_URL }}',
      failedUrl: '${{ steps.deploy.outputs.preview-url || env.CUSTOM_PREVIEW_URL }}',
      dependabotEnvironmentDefault: 'dependabot-preview',
      deployEnvironment:
        "${{ github.event_name == 'workflow_run' && github.event.workflow_run.pull_requests[0].user.login == 'dependabot[bot]' && inputs.dependabot-environment || null }}",
      deployConcurrency: {
        group:
          'dokploy-${{ github.repository }}-${{ inputs.application-prefix }}-pr-${{ github.event.workflow_run.pull_requests[0].number || github.event.pull_request.number }}',
        'cancel-in-progress': false,
      },
      reconcileEvents:
        "(github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.pull_requests[0]) || github.event_name == 'pull_request_target'",
      stateCheck: expect.objectContaining({
        env: expect.objectContaining({
          EVENT_NAME: '${{ github.event_name }}',
          PR_NUMBER: '${{ github.event.workflow_run.pull_requests[0].number || github.event.pull_request.number }}',
          WORKFLOW_SHA: '${{ github.event.workflow_run.head_sha }}',
        }),
        run: expect.stringMatching(
          /head\.sha[\s\S]*state.*closed[\s\S]*action=delete[\s\S]*EVENT_NAME.*workflow_run.*head_sha.*WORKFLOW_SHA[\s\S]*action=deploy[\s\S]*action=none/,
        ),
      }),
      openDeploy: "steps.pr.outputs.action == 'deploy'",
      closedCleanup: "steps.pr.outputs.action == 'delete'",
      closedStatus: "steps.pr.outputs.action == 'delete'",
      closedImages: "steps.pr.outputs.action == 'delete'",
      deployDns: expect.objectContaining({
        CLOUDFLARE_API_TOKEN: '${{ secrets.CLOUDFLARE_API_TOKEN }}',
        CLOUDFLARE_ZONE_ID: '${{ inputs.cloudflare-zone-id }}',
        PREVIEW_SUBDOMAIN_PREFIX: '${{ inputs.subdomain-prefix }}',
      }),
      deleteDns: expect.objectContaining({
        CLOUDFLARE_API_TOKEN: '${{ secrets.CLOUDFLARE_API_TOKEN }}',
        CLOUDFLARE_ZONE_ID: '${{ inputs.cloudflare-zone-id }}',
        PREVIEW_SUBDOMAIN_PREFIX: '${{ inputs.subdomain-prefix }}',
      }),
      pruneDns: expect.objectContaining({
        CLOUDFLARE_API_TOKEN: '${{ secrets.CLOUDFLARE_API_TOKEN }}',
        CLOUDFLARE_ZONE_ID: '${{ inputs.cloudflare-zone-id }}',
        PREVIEW_SUBDOMAIN_PREFIX: '${{ inputs.subdomain-prefix }}',
      }),
    })
  })
})

async function workflow(name: string) {
  return parse(await readFile(new URL(`../../../../.github/workflows/${name}`, import.meta.url), 'utf8')) as Workflow
}

function step(definition: Workflow, job: string, name: string) {
  const found = definition.jobs[job]?.steps?.find((candidate) => candidate.name === name)
  if (!found) throw new Error(`${job} is missing ${name}`)
  return found
}
