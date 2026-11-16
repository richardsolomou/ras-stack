const LIST_KEYS = ['requires', 'conflicts', 'dependencies', 'devDependencies', 'wires', 'starters']
const KEYS = new Set(['name', 'version', 'summary', ...LIST_KEYS])

/** Parses a recipe README's frontmatter, which allows only `key: scalar` and `key: [a, b]` lines. */
export function parseRecipe(text, source = 'README.md') {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text)
  if (!match) throw new Error(`${source}: missing frontmatter`)
  const fields = {}
  // oxfmt moves a long flow list onto indented lines, so indented lines continue the key above them.
  const lines = []
  for (const line of match[1].split('\n')) {
    if (lines.length > 0 && /^\s/.test(line))
      lines[lines.length - 1] = `${lines.at(-1).trimEnd()} ${line.trim()}`.replace(/\[\s+/, '[').replace(/,?\s*\]$/, ']')
    else lines.push(line)
  }
  for (const line of lines) {
    const entry = /^([A-Za-z]+):\s*(.*)$/.exec(line)
    if (!entry) throw new Error(`${source}: unreadable frontmatter line ${JSON.stringify(line)}`)
    const [, key, raw] = entry
    if (!KEYS.has(key)) throw new Error(`${source}: unknown frontmatter key ${key}`)
    if (key in fields) throw new Error(`${source}: repeated frontmatter key ${key}`)
    fields[key] = raw
  }
  const recipe = { name: fields.name, summary: fields.summary, version: Number(fields.version), body: text.slice(match[0].length) }
  if (!recipe.name) throw new Error(`${source}: missing name`)
  if (!recipe.summary) throw new Error(`${source}: missing summary`)
  if (!Number.isInteger(recipe.version) || recipe.version < 1) throw new Error(`${source}: version must be a positive integer`)
  for (const key of LIST_KEYS) {
    const raw = fields[key] ?? '[]'
    const list = /^\[(.*)\]$/.exec(raw)
    if (!list) throw new Error(`${source}: ${key} must be a [a, b] list`)
    recipe[key] = list[1].trim() === '' ? [] : list[1].split(',').map((item) => item.trim().replace(/^'(.*)'$/, '$1'))
    if (recipe[key].some((item) => item === '')) throw new Error(`${source}: ${key} has an empty item`)
  }
  return recipe
}

/** Starter files are copied once for the application to replace, so updates never merge into them; a `dir/` entry covers the directory. */
export function isStarter(recipe, path) {
  return recipe.starters.some((starter) => (starter.endsWith('/') ? path.startsWith(starter) : path === starter))
}
