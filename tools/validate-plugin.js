const fs = require('node:fs');
const path = require('node:path');

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function parseFrontmatter(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const obj = {};
  for (const line of m[1].split('\n')) {
    const mm = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (mm) obj[mm[1]] = mm[2].trim();
  }
  return obj;
}

function validateSkill(dir) {
  const errors = [];
  const skillPath = path.join(dir, 'SKILL.md');
  if (!fs.existsSync(skillPath)) return [`missing SKILL.md in ${dir}`];
  const fm = parseFrontmatter(fs.readFileSync(skillPath, 'utf8'));
  if (!fm) return [`${dir}: no frontmatter`];
  const name = fm.name;
  if (!name) errors.push(`${dir}: missing name`);
  else {
    if (name.length > 64) errors.push(`${dir}: name >64 chars`);
    if (!NAME_RE.test(name)) errors.push(`${dir}: name not lowercase-hyphen`);
    if (name !== path.basename(dir)) errors.push(`${dir}: name '${name}' != dir '${path.basename(dir)}'`);
  }
  if (!fm.description) errors.push(`${dir}: missing description`);
  else if (fm.description.length > 1024) errors.push(`${dir}: description >1024 chars`);
  return errors;
}

function validateJson(p, required) {
  let data;
  try { data = JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { return [`${p}: invalid JSON (${e.message})`]; }
  return required.filter(k => !(k in data)).map(k => `${p}: missing '${k}'`);
}

function validatePlugin(root) {
  const errors = [];
  errors.push(...validateJson(path.join(root, '.claude-plugin/marketplace.json'), ['name', 'owner', 'plugins']));
  const pluginDir = path.join(root, 'plugins/product-design-suite');
  errors.push(...validateJson(path.join(pluginDir, '.claude-plugin/plugin.json'), ['name', 'version', 'description']));
  const skillsDir = path.join(pluginDir, 'skills');
  if (fs.existsSync(skillsDir)) {
    for (const d of fs.readdirSync(skillsDir)) {
      const full = path.join(skillsDir, d);
      if (fs.statSync(full).isDirectory()) errors.push(...validateSkill(full));
    }
  }
  return errors;
}

module.exports = { parseFrontmatter, validateSkill, validateJson, validatePlugin };

if (require.main === module) {
  const root = process.argv[2] || '.';
  const errs = validatePlugin(root);
  if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
  console.log('OK: plugin valid');
}
