'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Validate once when loading the catalog, before accepting requests or changing account data.
function validateLearningContent({ modules, mindmaps }, { aliases = {}, root = path.join(__dirname, '..') } = {}) {
  const requireContent = (condition, message) => {
    if (!condition) throw new Error(`Invalid learning content: ${message}`);
  };
  const text = value => typeof value === 'string' && value.trim().length > 0 && !value.includes('\uFFFD');
  const texts = (values, minimum = 1) => Array.isArray(values) && values.length >= minimum && values.every(text);
  const moduleIds = new Set(), sections = new Map(), maps = new Map(), branches = new Map();
  requireContent(Array.isArray(modules) && modules.length > 0, 'modules are missing');
  requireContent(Array.isArray(mindmaps) && mindmaps.length > 0, 'mind maps are missing');
  for (const module of modules) {
    requireContent(module && /^mod-\d+$/.test(module.id) && !moduleIds.has(module.id), 'duplicate or invalid module ID');
    moduleIds.add(module.id);
    requireContent(text(module.title) && text(module.scope) && texts(module.studyGoals), `${module.id}: module explanation is incomplete`);
    requireContent(Array.isArray(module.sections) && module.sections.length > 0, `${module.id}: lessons are missing`);
    for (const section of module.sections) {
      requireContent(section && new RegExp(`^${module.id}-s\\d+$`).test(section.id) && !sections.has(section.id), `${module.id}: duplicate or invalid lesson ID`);
      sections.set(section.id, { moduleId: module.id, section });
      requireContent(text(section.title) && text(section.content) && texts(section.objectives, 2), `${section.id}: lesson explanation or objectives are incomplete`);
      requireContent(text(section.selfCheck?.prompt) && text(section.selfCheck?.answer), `${section.id}: self-check is incomplete`);
      requireContent(Array.isArray(section.sources) && section.sources.length > 0, `${section.id}: sources are missing`);
    }
  }
  for (const [oldId, target] of Object.entries(aliases)) {
    requireContent(!sections.has(oldId) && sections.has(target), `invalid lesson alias ${oldId}`);
  }
  function sourceURL(value, owner) {
    requireContent(text(value), `${owner}: source URL is missing`);
    let url;
    try { url = new URL(value, 'https://learning.invalid/pages/mindmaps.html'); }
    catch { requireContent(false, `${owner}: invalid source URL`); }
    requireContent(url.protocol === 'https:' && !url.username && !url.password, `${owner}: unsafe source URL`);
    if (url.origin !== 'https://learning.invalid') return;
    let filename, anchor;
    try {
      filename = path.resolve(root, '.' + decodeURIComponent(url.pathname));
      anchor = decodeURIComponent(url.hash.slice(1));
    } catch { requireContent(false, `${owner}: invalid local source URL`); }
    requireContent(filename.startsWith(path.resolve(root) + path.sep) && fs.existsSync(filename) && fs.statSync(filename).isFile(), `${owner}: local source does not exist`);
    if (url.pathname === '/pages/modules.html' && anchor) {
      requireContent(moduleIds.has(anchor) || sections.has(anchor) || sections.has(aliases[anchor]), `${owner}: source lesson does not exist`);
    }
  }
  for (const { section } of sections.values()) {
    for (const source of section.sources) {
      requireContent(text(source?.title) && text(source.locator), `${section.id}: source label is incomplete`);
      sourceURL(source.url, section.id);
      if (source.document) requireContent(Number.isInteger(source.firstPage) && source.firstPage > 0 && Number.isInteger(source.lastPage) && source.lastPage >= source.firstPage && source.url.endsWith('#page=' + source.firstPage), `${section.id}: invalid PDF locator`);
    }
    for (const [, id] of section.content.matchAll(/href=["']#(mod-\d+(?:-s\d+)?)["']/g)) {
      requireContent(moduleIds.has(id) || sections.has(id) || sections.has(aliases[id]), `${section.id}: broken lesson link ${id}`);
    }
  }
  for (const map of mindmaps) {
    requireContent(map && /^map-[a-z0-9-]+$/.test(map.id) && !maps.has(map.id), 'duplicate or invalid mind map ID');
    maps.set(map.id, map);
    requireContent(text(map.title) && text(map.shortTitle) && text(map.description) && text(map.memory) && text(map.root?.name) && text(map.root?.prompt), `${map.id}: map explanation is incomplete`);
    requireContent(moduleIds.has(map.moduleId), `${map.id}: unknown module`);
    requireContent(Array.isArray(map.sources) && map.sources.length > 0, `${map.id}: sources are missing`);
    for (const source of map.sources) {
      requireContent(text(source?.label), `${map.id}: source label is missing`);
      sourceURL(source.url, map.id);
    }
    requireContent(Array.isArray(map.root.branches) && map.root.branches.length > 0, `${map.id}: branches are missing`);
    for (const branch of map.root.branches) {
      requireContent(branch && /^b-[a-z0-9-]+$/.test(branch.id) && !branches.has(branch.id), `${map.id}: duplicate or invalid branch ID`);
      branches.set(branch.id, { mapId: map.id, branch });
      requireContent(['title', 'keyword', 'tagline', 'summary', 'memory', 'confusion', 'tone'].every(field => text(branch[field])), `${branch.id}: branch explanation is incomplete`);
      requireContent(sections.has(branch.sectionId) && sections.get(branch.sectionId).moduleId === branch.moduleId, `${branch.id}: lesson target does not match its module`);
      requireContent(Array.isArray(branch.details) && branch.details.length >= 3 && branch.details.every(item => text(item?.label) && text(item.text)), `${branch.id}: details are incomplete`);
      requireContent(['situation', 'reading', 'action'].every(field => text(branch.example?.[field])) && text(branch.recall?.question) && text(branch.recall?.answer), `${branch.id}: example or recall is incomplete`);
    }
  }
  for (const { branch } of branches.values()) {
    requireContent(Array.isArray(branch.related) && branch.related.length > 0, `${branch.id}: concept relationships are missing`);
    const targets = new Set();
    for (const link of branch.related) {
      requireContent(link && branches.has(link.branchId) && link.branchId !== branch.id && !targets.has(link.branchId) && text(link.relation), `${branch.id}: broken or duplicate concept relationship`);
      targets.add(link.branchId);
    }
  }
  for (const module of modules) {
    const workshop = module.workshop;
    requireContent(text(workshop?.title) && text(workshop.situation) && texts(workshop.tasks, 3) && texts(workshop.answer, 3) && workshop.tasks.length === workshop.answer.length && texts(workshop.criteria, 3), `${module.id}: applied workshop is incomplete`);
    requireContent(Array.isArray(workshop.pitfalls) && workshop.pitfalls.length >= 2 && workshop.pitfalls.every(item => text(item?.claim) && text(item.correction)), `${module.id}: misconception explanations are incomplete`);
    requireContent(texts(workshop.sectionIds) && workshop.sectionIds.every(id => sections.has(id)) && workshop.sectionIds.some(id => sections.get(id).moduleId === module.id), `${module.id}: broken workshop lesson reference`);
    const target = branches.get(workshop.branchId);
    requireContent(target?.mapId === 'map-practice' && target.branch.moduleId === module.id, `${module.id}: broken workshop mind map reference`);
  }
  return { modules: modules.length, sections: sections.size, workshops: modules.length, mindmaps: maps.size, branches: branches.size };
}

module.exports = { validateLearningContent };
