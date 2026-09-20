import { parseChangesetFile } from '@changesets/parse'
import { getPackages } from '@manypkg/get-packages'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function checkChangesets(root: string): Promise<string[]> {
  const files = await readdir(join(root, '.changeset')).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  const changesets = files.filter((file) => file.endsWith('.md') && file !== 'README.md').toSorted()
  if (changesets.length === 0) return []
  const { packages } = await getPackages(root)
  const names = new Set(packages.map(({ packageJson }) => packageJson.name))
  const errors: string[] = []
  for (const file of changesets) {
    const path = `.changeset/${file}`
    // Read serially so a large changeset directory does not open every file at once.
    // oxlint-disable-next-line no-await-in-loop
    const contents = await readFile(join(root, path), 'utf8')
    let releases
    try {
      releases = parseChangesetFile(contents).releases
    } catch {
      errors.push(`${path}: missing or invalid frontmatter`)
      continue
    }
    for (const { name } of releases) {
      if (!names.has(name)) errors.push(`${path}: unknown package ${JSON.stringify(name)}`)
    }
  }
  return errors
}
