'use strict';
const { transaction } = require('./database');
const { UUID, failure, tokenHash } = require('./security');
const { FICHE_CYCLES } = require('../scripts/data/ficheData');
const DAY = 86400000;
const DRAFT_FIELDS = ['subject','title','competence','objectives','pedagogy','criteria','support','materials',
  'step1','step2','step3','step4','assessment1','assessment2','assessment3','assessment4'];
const DRAFT_METADATA_LIMITS = { language: 2, cycle: 16, level: 8, track: 120, school: 200, teacher: 200, sessionDate: 10, duration: 120,
  student1: 4000, student2: 4000, student3: 4000, student4: 4000,
  phaseDuration1: 4, phaseDuration2: 4, phaseDuration3: 4, phaseDuration4: 4 };
function emptyProgress() {
  return { completedModules: [], quizScore: 0, lastQuizScore: null, quizzesTaken: 0, simulatorCompleted: [],
    masteredFlashcards: [], reviewFlashcards: [], flashcardsMastered: 0, mindmapsViewed: [], lastModuleId: null, lastActive: null };
}
function createLearning({ db, catalog, now, limiter }) {
  const progressFor = id => ({ ...emptyProgress(), ...JSON.parse(db.prepare('SELECT data FROM progress WHERE user_id=?').get(id)?.data || '{}') });
  const storeProgress = (id, data) => db.prepare('INSERT INTO progress VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data').run(id, JSON.stringify(data));
  function applyEvent(id, event) {
    if (typeof event.operationId !== 'string' || !UUID.test(event.operationId)) throw failure(400, 'معرف حفظ غير صالح.');
    const datasets = { module: catalog.modules, 'visit-module': catalog.modules, simulator: catalog.simulator, mindmap: catalog.mindmaps, flashcard: catalog.flashcards };
    if (typeof event.type !== 'string' || typeof event.id !== 'string' || !Object.hasOwn(datasets,event.type) || !datasets[event.type].some(item => item.id === event.id)) throw failure(400, 'عملية أو عنصر غير صالح.');
    if (event.type === 'module' && typeof event.completed !== 'boolean' || event.type === 'flashcard' && typeof event.known !== 'boolean') throw failure(400, 'حالة غير صالحة.');
    const normalized = { type: event.type, id: event.id };
    if (event.type === 'module') normalized.completed = event.completed;
    if (event.type === 'flashcard') normalized.known = event.known;
    const hash = tokenHash(JSON.stringify(normalized));
    const old = db.prepare('SELECT payload_hash FROM progress_events WHERE user_id=? AND operation_id=?').get(id, event.operationId);
    if (old) {
      if (old.payload_hash && old.payload_hash !== hash) throw failure(409, 'معرف الحفظ مستخدم لعملية أخرى.');
      return progressFor(id);
    }
    limiter.check(`progress:${id}`, 180, 60000);
    return transaction(db, () => {
      const progress = progressFor(id);
      db.prepare('INSERT INTO progress_events(user_id,operation_id,created_at,payload_hash) VALUES(?,?,?,?)').run(id, event.operationId, now(), hash);
      const set = (field, value, included = true) => {
        progress[field] = progress[field].filter(item => item !== value);
        if (included) progress[field].push(value);
      };
      if (event.type === 'module') set('completedModules', event.id, event.completed);
      if (event.type === 'visit-module') progress.lastModuleId = event.id;
      if (event.type === 'simulator') set('simulatorCompleted', event.id);
      if (event.type === 'mindmap') set('mindmapsViewed', event.id);
      if (event.type === 'flashcard') {
        set('masteredFlashcards', event.id, event.known); set('reviewFlashcards', event.id, !event.known);
        progress.flashcardsMastered = progress.masteredFlashcards.length;
        const previous = db.prepare('SELECT * FROM card_reviews WHERE user_id=? AND card_id=?').get(id, event.id);
        const repetitions = event.known ? (previous?.repetitions || 0) + 1 : 0;
        const interval = event.known ? [1,3,7,14,30,60,120,180][Math.min(repetitions - 1, 7)] : 0;
        const due = now() + (event.known ? interval * DAY : 10 * 60000);
        db.prepare(`INSERT INTO card_reviews VALUES(?,?,?,?,?) ON CONFLICT(user_id,card_id)
          DO UPDATE SET repetitions=excluded.repetitions,interval_days=excluded.interval_days,due_at=excluded.due_at`).run(id, event.id, repetitions, interval, due);
      }
      progress.lastActive = new Date(now()).toISOString(); storeProgress(id, progress);
      return progress;
    });
  }
  function recordQuiz(id, score, total) {
    // Caller owns the transaction and supplies a score calculated from stored answers.
    const progress = progressFor(id);
    progress.lastQuizScore = Math.round(score / total * 100);
    progress.quizScore = Math.max(progress.quizScore, progress.lastQuizScore);
    progress.quizzesTaken++; progress.lastActive = new Date(now()).toISOString();
    storeProgress(id, progress);
  }
  function reviewQueue(id) {
    const rows = db.prepare('SELECT * FROM card_reviews WHERE user_id=?').all(id);
    const states = new Map(rows.map(row => [row.card_id, row]));
    const due = catalog.flashcards.filter(card => !states.has(card.id) || states.get(card.id).due_at <= now()).map(card => card.id);
    return { dueIds: due, total: catalog.flashcards.length, nextReview: rows.filter(row => row.due_at > now()).sort((a,b) => a.due_at - b.due_at)[0]?.due_at || null };
  }
  function draftView(row) { return row ? { id: row.id, title: row.title, fields: JSON.parse(row.fields), version: row.version, updatedAt: row.updated_at } : null; }
  function ownedDraft(id, userId) {
    if (typeof id !== 'string' || !UUID.test(id)) throw failure(400, 'معرف جذاذة غير صالح.');
    const row = db.prepare('SELECT * FROM lesson_drafts WHERE id=? AND user_id=?').get(id, userId);
    if (!row) throw failure(404, 'الجذاذة غير موجودة.');
    return row;
  }
  function saveDraft(userId, body) {
    if (typeof body.id !== 'string' || !UUID.test(body.id) || !Number.isSafeInteger(body.version) || body.version < 0 || body.version >= Number.MAX_SAFE_INTEGER || !body.fields || typeof body.fields !== 'object' || Array.isArray(body.fields)) throw failure(400, 'جذاذة غير صالحة.');
    const fields = {};
    for (const key of DRAFT_FIELDS) {
      if (typeof body.fields[key] !== 'string' || body.fields[key].length > 4000) throw failure(400, 'تحقق من حقول الجذاذة وحجم النصوص.');
      fields[key] = body.fields[key];
    }
    // Optional fields keep older drafts compatible with the expanded lesson model.
    for (const [key, limit] of Object.entries(DRAFT_METADATA_LIMITS)) {
      if (body.fields[key] === undefined) continue;
      if (typeof body.fields[key] !== 'string' || body.fields[key].length > limit) throw failure(400, 'تحقق من معطيات المستوى ولغة الجذاذة.');
      fields[key] = body.fields[key];
    }
    if (fields.language !== undefined && !['ar','fr'].includes(fields.language)) throw failure(400, 'لغة الجذاذة غير صالحة.');
    for (let index = 1; index <= 4; index++) {
      const minutes = fields['phaseDuration' + index];
      if (minutes && (!/^\d{1,4}$/.test(minutes) || Number(minutes) > 1440)) throw failure(400, 'مدة المرحلة يجب أن تكون عددا صحيحا بين 0 و1440 دقيقة.');
    }
    if (fields.cycle || fields.level) {
      const cycle = FICHE_CYCLES.find(item => item.id === fields.cycle);
      if (!cycle || fields.level && !cycle.levels.some(item => item.id === fields.level)) throw failure(400, 'المستوى الدراسي لا يطابق السلك المختار.');
    }
    if (fields.sessionDate) {
      const sessionDate = new Date(fields.sessionDate + 'T12:00:00Z');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.sessionDate) || Number.isNaN(sessionDate.getTime()) || sessionDate.toISOString().slice(0,10) !== fields.sessionDate) throw failure(400, 'تاريخ الحصة غير صالح.');
    }
    const title = fields.title.trim();
    if (!title || title.length > 200 || Buffer.byteLength(JSON.stringify(fields)) > 24576) throw failure(400, 'أدخل عنواناً للجذاذة واختصر النصوص الطويلة.');
    const serialized = JSON.stringify(fields);
    return transaction(db, () => {
      const existing = db.prepare('SELECT * FROM lesson_drafts WHERE id=?').get(body.id);
      if (existing && existing.user_id !== userId) throw failure(404, 'الجذاذة غير موجودة.');
      if (existing?.fields === serialized) return draftView(existing); // A retry of an already committed save.
      if ((existing?.version || 0) !== body.version) throw Object.assign(failure(409, 'عُدلت هذه الجذاذة في نافذة أخرى. افتح النسخة المحفوظة قبل المتابعة.'), { code: 'DRAFT_CONFLICT' });
      if (!existing && db.prepare('SELECT COUNT(*) AS count FROM lesson_drafts WHERE user_id=?').get(userId).count >= 50) throw failure(409, 'وصلت إلى حد 50 جذاذة. احذف جذاذة قديمة أولاً.');
      db.prepare(`INSERT INTO lesson_drafts VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
        title=excluded.title,fields=excluded.fields,version=excluded.version,updated_at=excluded.updated_at`).run(body.id, userId, title, serialized, body.version + 1, now());
      return draftView(db.prepare('SELECT * FROM lesson_drafts WHERE id=?').get(body.id));
    });
  }
  return { progressFor, applyEvent: (id, event) => transaction(db, () => applyEvent(id, event)), recordQuiz, reviewQueue, saveDraft,
    listDrafts: id => db.prepare('SELECT id,title,version,updated_at AS updatedAt FROM lesson_drafts WHERE user_id=? ORDER BY updated_at DESC').all(id),
    getDraft: (id, userId) => draftView(ownedDraft(id, userId)),
    deleteDraft(id, userId, version) {
      return transaction(db, () => {
        const row = ownedDraft(id, userId);
        if (row.version !== version) throw failure(409, 'عُدلت الجذاذة في نافذة أخرى. افتح أحدث نسخة قبل الحذف.');
        db.prepare('DELETE FROM lesson_drafts WHERE id=? AND user_id=? AND version=?').run(id, userId, version);
      });
    }
  };
}
module.exports = { createLearning, emptyProgress, DRAFT_FIELDS };
