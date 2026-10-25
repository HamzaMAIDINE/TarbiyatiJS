/* Shared, testable session generation. Original question IDs and option indices
   are retained so shuffling never changes which answer is correct. */
const QuizSession = (() => {
  function shuffle(items, random = Math.random) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index--) {
      const selected = Math.floor(random() * (index + 1));
      [result[index], result[selected]] = [result[selected], result[index]];
    }
    return result;
  }

  function create(questions, { category = 'all', difficulty = 'all', kind = 'all', source = 'all', limit = 20, previousIds = [] } = {}, random = Math.random) {
    const pool = questions.filter(question =>
      (category === 'all' || question.category === category) &&
      (difficulty === 'all' || question.difficulty === difficulty) &&
      (kind === 'all' || (question.kind || 'concept') === kind) &&
      (source === 'all' || (source === 'training' ? !question.sourceExamId : question.sourceExamId === source)));
    let selected = shuffle(pool, random);
    const count = limit === 'all' ? selected.length : Math.max(1, Math.min(Number(limit) || 20, selected.length));
    selected = selected.slice(0, count);
    if (selected.length > 1 && selected.length === previousIds.length && selected.every((question, index) => question.id === previousIds[index])) {
      selected.push(selected.shift());
    }
    return {
      poolSize: pool.length,
      questions: selected.map(question => ({
        ...question,
        presentedOptions: shuffle(question.options.map((text, originalIndex) => ({ text, originalIndex })), random)
      }))
    };
  }

  function score(questions, answers) {
    return questions.reduce((total, question) => total + (answers[question.id] === question.correctAnswer ? 1 : 0), 0);
  }
  return { shuffle, create, score };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { QuizSession };
