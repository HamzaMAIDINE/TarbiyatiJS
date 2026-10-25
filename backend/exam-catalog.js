'use strict';
const sources = require('../content/exams/sources.json');
const categories = Object.fromEntries(require('../scripts/data/curriculumData').CURRICULUM_DATA.map(module => [module.id,module.questionCategory]));
const situationNumbers = {
  2023: [68, 71, 74, 75, 79, 81, 86, 109, 118],
  2024: [71, 84, 86, 89, 98, 104, 114, 118],
  2025: [84]
};
const exams = [2023, 2024, 2025].map(year => {
  const paper = require(`../content/exams/${year}.json`);
  const scans = sources[year];
  const questions = paper.questions.map(row => {
    const page = year === 2023 ? 3 + Math.floor((row.number - 61) / 6)
      : (year === 2024 ? 4 : 2) + Math.floor((row.number - 61) / 5);
    const correctAnswer = row.answer === null ? null : 'ABCDE'.indexOf(row.answer);
    if (!categories[row.moduleId] || correctAnswer !== null && (correctAnswer < 0 || correctAnswer >= row.options.length)) {
      throw new Error(`Invalid correction or module: ${year} Q${row.number}`);
    }
    const correctionStatus = correctAnswer === null ? 'review' : year === 2024 ? 'suggested' : 'provided';
    return { ...row, id: year * 1000 + row.number, examNumber: row.number, sourceExamId: paper.id,
      category: categories[row.moduleId], difficulty: 'متوسط', kind: situationNumbers[year].includes(row.number) ? 'situation' : 'concept', correctAnswer,
      correctionStatus, sourcePage: scans.pages[page - 1].url,
      source: `${paper.title}، Q${row.number} · ${correctionStatus === 'provided' ? 'حرف من التصحيح المرفق؛ التعليل إعداد تربيتي' : correctionStatus === 'suggested' ? 'تصحيح تدريبي مقترح من تربيتي' : 'بند للمراجعة دون تنقيط'}` };
  });
  if (questions.length !== 60 || questions.some((question, index) => question.number !== 61 + index)) {
    throw new Error(`Exam ${year} must contain Q61–Q120 in order.`);
  }
  return { ...paper, questions, pages: scans.pages, correctionScans: scans.corrections,
    questionCount: questions.length, gradableCount: questions.filter(question => question.correctAnswer !== null).length };
});
module.exports = { exams };
