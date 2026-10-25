'use strict';
const crypto = require('node:crypto');
const { QuizSession } = require('../scripts/quiz-session');
const { transaction } = require('./database');
const { UUID, failure } = require('./security');

function createQuizzes({ db, catalog, now, limiter, learning }) {
  const questions = new Map([...catalog.exams.flatMap(exam => exam.questions), ...catalog.quiz].map(question => [String(question.id), question]));
  const examInfo = exam => ({ id: exam.id, year: exam.year, title: exam.title, durationMinutes: exam.durationMinutes,
    coefficient: exam.coefficient, questionCount: exam.questionCount, gradableCount: exam.gradableCount,
    correctionNote: exam.correctionNote, scoringNote: exam.scoringNote, contextNote: exam.contextNote,
    passage: exam.passage, passageSource: exam.passageSource, pages: exam.pages.map((page, index) => ({ number: index + 1, url: page.url })) });
  const gradedTotal = entries => entries.filter(entry => Number.isInteger(entry.correctAnswer)).length;
  const isPaper = row => Boolean(JSON.parse(row.config).examId);
  const remaining = row => row.status === 'paused' ? row.remaining_ms : row.deadline === null ? null : Math.max(0, row.deadline - now());
  function sessions(userId) {
    return db.prepare("SELECT * FROM quiz_attempts WHERE user_id=? AND status IN ('active','paused') ORDER BY created_at DESC").all(userId)
      .filter(isPaper).map(row => ({ id:row.id, examId:JSON.parse(row.config).examId, status:row.status, version:row.state_version,
        answered:Object.keys(JSON.parse(row.answers)).length, currentIndex:row.position, remainingMs:remaining(row) }));
  }
  const response = row => ({ attempt:view(row), sessions:sessions(row.user_id) });
  const summary = row => ({ id: row.id, mode: row.mode, createdAt: row.created_at, finishedAt: row.finished_at,
    examId: JSON.parse(row.config).examId || null,
    score: row.score, total: gradedTotal(JSON.parse(row.questions)), questionCount: JSON.parse(row.questions).length,
    percent: Math.round(row.score / gradedTotal(JSON.parse(row.questions)) * 100) });
  function owned(id, userId) {
    if (typeof id !== 'string' || !UUID.test(id)) throw failure(400, 'معرف اختبار غير صالح.');
    const row = db.prepare('SELECT * FROM quiz_attempts WHERE id=? AND user_id=?').get(id, userId);
    if (!row) throw failure(404, 'المحاولة غير موجودة.');
    return row;
  }
  function finish(row) {
    return transaction(db, () => {
      row = owned(row.id, row.user_id);
      if (row.status === 'submitted') return row;
      if (row.status === 'paused') throw Object.assign(failure(409, 'الامتحان متوقف مؤقتاً. استأنفه قبل إكمال الإجابات أو التسليم.'), {code:'EXAM_PAUSED'});
      if (row.status !== 'active') throw failure(409, 'بدأت محاولة أخرى. افتح المحاولة الحالية.');
      const entries = JSON.parse(row.questions); const answers = JSON.parse(row.answers);
      const score = entries.reduce((sum, entry) => sum + (Number.isInteger(entry.correctAnswer) && answers[entry.id] === entry.correctAnswer ? 1 : 0), 0);
      db.prepare("UPDATE quiz_attempts SET status='submitted',finished_at=?,score=? WHERE id=? AND status='active'").run(now(), score, row.id);
      learning.recordQuiz(row.user_id, score, gradedTotal(entries));
      return owned(row.id, row.user_id);
    });
  }
  function expire(row) { return row.status === 'active' && row.deadline !== null && row.deadline <= now() ? finish(row) : row; }
  function view(row) {
    const entries = JSON.parse(row.questions); const answers = JSON.parse(row.answers);
    const exam = catalog.exams.find(exam => exam.id === JSON.parse(row.config).examId);
    return { id: row.id, mode: row.mode, config: JSON.parse(row.config), status: row.status, answers,
      ...(exam ? { exam: { ...examInfo(exam), ...(row.status === 'submitted' ? { correctionScans: exam.correctionScans.map(scan => scan.url) } : {}) } } : {}),
      currentIndex: row.position, deadline: row.deadline, remainingMs:remaining(row), pausedAt:row.paused_at, version:row.state_version,
      serverTime: now(), poolSize: row.pool_size, bankSize: catalog.quiz.length,
      ...(row.status === 'submitted' ? { result: { ...summary(row), answered: Object.keys(answers).length } } : {}),
      questions: entries.map(entry => {
        const current = questions.get(String(entry.id));
        const question = { id: entry.id, question: entry.question, scenario: entry.scenario, category: current?.category || entry.category,
          difficulty: entry.difficulty, kind: entry.kind || 'concept', moduleId: current?.moduleId || entry.moduleId, presentedOptions: entry.presentedOptions,
          examNumber: entry.examNumber, sourceExamId: entry.sourceExamId, sourcePage: entry.sourcePage, figure: entry.figure };
        if (row.status === 'submitted' || row.mode === 'practice' && answers[entry.id] !== undefined) {
          const sameContent = current?.question === entry.question && current.correctAnswer === entry.correctAnswer && JSON.stringify(current.options) === JSON.stringify(entry.options);
          question.correctAnswer = entry.correctAnswer;
          question.explanation = sameContent ? current.explanation : entry.explanation;
          question.source = sameContent ? current.source : entry.source;
          question.correctionStatus = entry.correctionStatus; question.reviewNote = entry.reviewNote;
          // References follow the reviewed course; grading always uses the stored question and key.
          question.lessonReferences = current?.lessonReferences || entry.lessonReferences;
          question.learningNote = current?.learningNote || entry.learningNote;
        }
        return question;
      }) };
  }
  function start(userId, body) {
    if (typeof body.operationId !== 'string' || !UUID.test(body.operationId) || !['practice','exam'].includes(body.mode)) throw failure(400, 'إعداد اختبار غير صالح.');
    const exam = body.examId === undefined ? null : catalog.exams.find(exam => exam.id === body.examId);
    if (body.examId !== undefined && (!exam || body.mode !== 'exam')) throw failure(400, 'امتحان غير صالح.');
    const config = exam ? { examId: exam.id, category: 'all', difficulty: 'all', kind: 'all', limit: 'all', source: exam.id }
      : { category: body.category || 'all', difficulty: body.difficulty || 'all', kind: body.kind || 'all', limit: String(body.limit || '20'), source: body.source || 'all' };
    if (!['all', 'training', ...catalog.exams.map(exam => exam.id)].includes(config.source)) throw failure(400, 'مصدر أسئلة غير صالح.');
    for (const field of ['category','difficulty','kind']) {
      const valid = new Set(catalog.quiz.map(q => field === 'kind' ? q.kind || 'concept' : q[field]));
      if (typeof config[field] !== 'string' || config[field] !== 'all' && !valid.has(config[field])) throw failure(400, 'اختيار غير صالح.');
    }
    if (!['10','20','30','all'].includes(config.limit)) throw failure(400, 'حجم اختبار غير صالح.');
    const existing = db.prepare('SELECT * FROM quiz_attempts WHERE id=?').get(body.operationId);
    if (existing) {
      if (existing.user_id !== userId) throw failure(404, 'المحاولة غير موجودة.');
      if (existing.mode !== body.mode || existing.config !== JSON.stringify(config)) throw failure(409, 'معرف المحاولة مستخدم لإعداد آخر.');
      return response(expire(existing));
    }
    if (exam) {
      const unfinished = db.prepare("SELECT * FROM quiz_attempts WHERE user_id=? AND status IN ('active','paused') ORDER BY created_at DESC").all(userId)
        .find(row => JSON.parse(row.config).examId === exam.id);
      if (unfinished) { const current = expire(unfinished); if (['active','paused'].includes(current.status)) return response(current); }
    }
    limiter.check(`quiz-start:${userId}`, 20, 60000);
    const previous = db.prepare('SELECT questions FROM quiz_attempts WHERE user_id=? ORDER BY created_at DESC LIMIT 1').get(userId);
    const session = exam ? { poolSize: exam.questions.length, questions: exam.questions.map(question => ({ ...question,
      presentedOptions: question.options.map((text, originalIndex) => ({ text, originalIndex })) })) }
      : QuizSession.create(catalog.quiz, { ...config, previousIds: previous ? JSON.parse(previous.questions).map(q => q.id) : [] }, () => crypto.randomInt(0x100000000) / 0x100000000);
    if (!session.questions.length) return { attempt: null, poolSize: 0, bankSize: catalog.quiz.length };
    const active = db.prepare("SELECT * FROM quiz_attempts WHERE user_id=? AND status='active'").all(userId);
    for (const row of active) expire(row); // Never abandon an expired exam without recording its result.
    transaction(db, () => {
      for (const previous of active) {
        const row = owned(previous.id, userId);
        if (row.status !== 'active') continue;
        if (isPaper(row)) pauseRow(row);
        else if (!exam) db.prepare("UPDATE quiz_attempts SET status='abandoned' WHERE id=? AND status='active'").run(row.id);
      }
      db.prepare('INSERT INTO quiz_attempts(id,user_id,mode,config,questions,pool_size,created_at,deadline) VALUES(?,?,?,?,?,?,?,?)')
        .run(body.operationId, userId, body.mode, JSON.stringify(config), JSON.stringify(session.questions), session.poolSize, now(), body.mode === 'exam' ? now() + (exam?.durationMinutes || session.questions.length) * 60000 : null);
    });
    return response(owned(body.operationId, userId));
  }
  function pauseRow(row, position = row.position) {
    db.prepare("UPDATE quiz_attempts SET status='paused',remaining_ms=?,deadline=NULL,paused_at=?,position=?,state_version=state_version+1 WHERE id=? AND status='active'")
      .run(remaining(row), now(), position, row.id);
    return owned(row.id, row.user_id);
  }
  function pause(userId, body) {
    const row = expire(owned(body.attemptId, userId));
    if (!isPaper(row)) throw failure(400, 'الإيقاف المؤقت متاح لأوراق الامتحانات السابقة.');
    if (['paused','submitted'].includes(row.status)) return response(row);
    if (row.status !== 'active' || body.version !== row.state_version) throw Object.assign(failure(409, 'تغيرت حالة الامتحان في نافذة أخرى. أعد تحميل المحاولة.'), {code:'EXAM_STATE_CHANGED'});
    const position = body.currentIndex ?? row.position;
    if (!Number.isInteger(position) || position < 0 || position >= JSON.parse(row.questions).length) throw failure(400, 'موضع سؤال غير صالح.');
    return response(pauseRow(row, position));
  }
  function resume(userId, body) {
    const row = expire(owned(body.attemptId, userId));
    if (!isPaper(row)) throw failure(400, 'هذه المحاولة ليست ورقة امتحان.');
    if (['active','submitted'].includes(row.status)) return response(row);
    if (row.status !== 'paused' || body.version !== row.state_version) throw Object.assign(failure(409, 'تغيرت حالة الامتحان في نافذة أخرى. أعد تحميل المحاولة.'), {code:'EXAM_STATE_CHANGED'});
    const others = db.prepare("SELECT * FROM quiz_attempts WHERE user_id=? AND status='active' AND id!=?").all(userId, row.id);
    for (const other of others) expire(other);
    transaction(db, () => {
      for (const other of others) { const current = owned(other.id, userId); if (isPaper(current) && current.status === 'active') pauseRow(current); }
      db.prepare("UPDATE quiz_attempts SET status='active',deadline=?,remaining_ms=NULL,paused_at=NULL,state_version=state_version+1 WHERE id=? AND status='paused'")
        .run(now() + row.remaining_ms, row.id);
    });
    return response(owned(row.id, userId));
  }
  function answer(userId, body) {
    let row = expire(owned(body.attemptId, userId));
    if (row.status === 'submitted') return { attempt: view(row), expired: true };
    if (row.status === 'paused') throw Object.assign(failure(409, 'الامتحان متوقف مؤقتاً. استأنفه قبل إكمال الإجابات أو التسليم.'), {code:'EXAM_PAUSED'});
    if (row.status !== 'active') throw failure(409, 'بدأت محاولة أخرى. افتح المحاولة الحالية.');
    const entries = JSON.parse(row.questions);
    const question = entries.find(entry => entry.id === body.questionId);
    if (!question || !Number.isInteger(body.choice) || body.choice < 0 || body.choice >= question.options.length) throw failure(400, 'إجابة غير صالحة.');
    const answers = JSON.parse(row.answers);
    if (row.mode === 'practice' && answers[question.id] !== undefined && answers[question.id] !== body.choice) throw failure(409, 'تم تصحيح هذا السؤال. ابدأ محاولة جديدة لتغييره.');
    answers[question.id] = body.choice;
    const position = body.currentIndex ?? row.position;
    if (!Number.isInteger(position) || position < 0 || position >= entries.length) throw failure(400, 'موضع سؤال غير صالح.');
    db.prepare('UPDATE quiz_attempts SET answers=?,position=? WHERE id=?').run(JSON.stringify(answers), position, row.id);
    return { attempt: view(owned(row.id, userId)) };
  }
  function history(userId) {
    const rows = db.prepare("SELECT * FROM quiz_attempts WHERE user_id=? AND status='submitted' ORDER BY finished_at DESC LIMIT 50").all(userId);
    const weak = new Map();
    for (const row of rows) {
      const answers = JSON.parse(row.answers);
      for (const question of JSON.parse(row.questions)) {
        if (!Number.isInteger(question.correctAnswer)) continue;
        if (answers[question.id] === question.correctAnswer) continue;
        const current = questions.get(String(question.id));
        const moduleId = current?.moduleId || question.moduleId || null;
        const key = moduleId || question.category;
        const item = weak.get(key) || { moduleId, category: current?.category || question.category, missed: 0 };
        item.missed++; weak.set(key, item);
      }
    }
    return { attempts: rows.map(summary), weaknesses: [...weak.values()].sort((a,b) => b.missed - a.missed).slice(0,5) };
  }
  const atomic = work => (...args) => transaction(db, () => work(...args));
  return { start: atomic(start), answer: atomic(answer), history, pause: atomic(pause), resume: atomic(resume),
    examLibrary: () => catalog.exams.map(examInfo),
    describe: () => ({ total: catalog.quiz.length, situations: catalog.quiz.filter(question => question.kind === 'situation').length,
      examQuestions: catalog.quiz.filter(question => question.sourceExamId).length,
      categories: [...new Set(catalog.quiz.map(question => question.category))], sources: catalog.exams.map(exam => ({ id: exam.id, title: exam.title })) }),
    finalizeExpired() {
      for (const candidate of db.prepare("SELECT id FROM quiz_attempts WHERE status='active' AND deadline<=?").all(now())) transaction(db, () => {
        const row = db.prepare('SELECT * FROM quiz_attempts WHERE id=?').get(candidate.id);
        if (row) expire(row);
      });
    },
    get: atomic((userId, id) => ({ attempt: view(expire(owned(id, userId))) })),
    submit: atomic((userId, id) => ({ attempt: view(finish(owned(id, userId))), progress: learning.progressFor(userId) })),
    active: atomic(function (userId, scope = 'all') {
      if (!['all','quiz','exams'].includes(scope)) throw failure(400, 'نطاق محاولة غير صالح.');
      const row = db.prepare("SELECT * FROM quiz_attempts WHERE user_id=? AND status='active' ORDER BY created_at DESC").all(userId)
        .find(row => scope === 'all' || (scope === 'exams' ? isPaper(row) : !isPaper(row)));
      return { attempt:row ? view(expire(row)) : null, sessions:sessions(userId) };
    })
  };
}
module.exports = { createQuizzes };
