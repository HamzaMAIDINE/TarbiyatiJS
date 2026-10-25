'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.join(__dirname, '..');
const { exams } = require('./exam-catalog');
function load(filename, variable) {
  const source = fs.readFileSync(path.join(ROOT, 'scripts/data', filename), 'utf8');
  return vm.runInNewContext(`${source}\n${variable}`, Object.create(null), { timeout: 1000 });
}
const catalog = require('./learning-references').connectLearningReferences({
  modules: require('../scripts/data/curriculumData').CURRICULUM_DATA,
  simulator: load('simulatorData.js', 'SIMULATOR_DATA'),
  flashcards: load('flashcardsData.js', 'FLASHCARDS_DATA'),
  mindmaps: load('mindmapsData.js', 'MINDMAPS_DATA'),
  exams,
  quiz: [...load('quizData.js', 'QUIZ_DATA'), ...exams.flatMap(exam => exam.questions.filter(question => question.correctAnswer !== null).map(question => ({
    ...question,
    options: question.options.map(option => option.replace(/جميع الاختيارات (?:السابقة )?المقترحة خاطئة/, 'لا شيء من البدائل الأخرى صحيح')),
    ...((exam.year === 2023 && question.number <= 65 || exam.year === 2024 && [61,62,64,65,67,69,70,72,73].includes(question.number)) ? { scenario: exam.passage } : {})
  })))]
});
require('./validate-learning-content').validateLearningContent(catalog, { aliases: require('../scripts/data/curriculumData').CURRICULUM_ALIASES });
module.exports = catalog;
