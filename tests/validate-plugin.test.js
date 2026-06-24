const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const v = require('../tools/validate-plugin.js');

test('parseFrontmatter reads name and description', () => {
  const fm = v.parseFrontmatter('---\nname: lpp-prd-builder\ndescription: Build a PRD\n---\nbody');
  assert.equal(fm.name, 'lpp-prd-builder');
  assert.equal(fm.description, 'Build a PRD');
});

test('validateSkill flags name != dir', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lpp-'));
  const skill = path.join(dir, 'lpp-prd-builder');
  fs.mkdirSync(skill);
  fs.writeFileSync(path.join(skill, 'SKILL.md'), '---\nname: wrong-name\ndescription: x\n---\n');
  const errs = v.validateSkill(skill);
  assert.ok(errs.some(e => /!=/.test(e)), errs.join(';'));
});

test('validateSkill passes a correct skill', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lpp-'));
  const skill = path.join(dir, 'lpp-adr-builder');
  fs.mkdirSync(skill);
  fs.writeFileSync(path.join(skill, 'SKILL.md'), '---\nname: lpp-adr-builder\ndescription: Build an ADR\n---\n');
  assert.deepEqual(v.validateSkill(skill), []);
});

test('validateJson flags missing keys', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lpp-'));
  const p = path.join(dir, 'm.json');
  fs.writeFileSync(p, JSON.stringify({ name: 'x' }));
  const errs = v.validateJson(p, ['name', 'owner']);
  assert.ok(errs.some(e => /owner/.test(e)));
});
