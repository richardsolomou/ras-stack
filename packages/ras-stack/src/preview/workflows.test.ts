import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

type Step = { name?: string; with?: Record<string, string> }
type Workflow = {
  on: {
    workflow_call: {
      inputs: Record<string, { default?: string }>
      secrets?: Record<string, { required?: boolean }>
    }
  }
  jobs: Record<string, { steps?: Step[]; with?: Record<string, string>; secrets?: Record<string, string> }>
}

describe('Dokploy preview workflows', () => {
  it('forwards one target platform to trusted images and fork artifacts', async () => {
    const dokploy = await workflow('build-dokploy-preview.yml')
    const image = await workflow('build-preview-image.yml')

    expect({
      defaultPlatform: dokploy.on.workflow_call.inputs.platform?.default,
      forwardedPlatform: dokploy.jobs.build?.with?.platform,
      imageDefault: image.on.workflow_call.inputs.platform?.default,
      trustedPlatform: step(image, 'build', 'Build and publish trusted preview image').with?.platforms,
      forkPlatform: step(image, 'build', 'Build untrusted preview artifact').with?.platforms,
    }).toEqual({
      defaultPlatform: 'linux/amd64',
      forwardedPlatform: '${{ inputs.platform }}',
      imageDefault: 'linux/amd64',
      trustedPlatform: '${{ inputs.platform }}',
      forkPlatform: '${{ inputs.platform }}',
    })
  })

  it('forwards an optional build secret only to trusted preview builds', async () => {
    const dokploy = await workflow('build-dokploy-preview.yml')
    const image = await workflow('build-preview-image.yml')
    const trusted = step(image, 'build', 'Build and publish trusted preview image')
    const untrusted = step(image, 'build', 'Build untrusted preview artifact')

    expect({
      inputDefault: dokploy.on.workflow_call.inputs['build-secret-id']?.default,
      declaredSecret: dokploy.on.workflow_call.secrets?.['build-secret'],
      forwardedInput: dokploy.jobs.build?.with?.['build-secret-id'],
      forwardedSecret: dokploy.jobs.build?.secrets?.['build-secret'],
      imageSecret: image.on.workflow_call.secrets?.['build-secret'],
      trustedBuildSecret: trusted.with?.secrets,
      untrustedBuildSecret: untrusted.with?.secrets,
    }).toEqual({
      inputDefault: '',
      declaredSecret: expect.objectContaining({ required: false }),
      forwardedInput: '${{ inputs.build-secret-id }}',
      forwardedSecret: '${{ secrets.build-secret }}',
      imageSecret: expect.objectContaining({ required: false }),
      trustedBuildSecret: "${{ inputs.build-secret-id != '' && format('{0}={1}', inputs.build-secret-id, secrets.build-secret) || '' }}",
      untrustedBuildSecret: undefined,
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
