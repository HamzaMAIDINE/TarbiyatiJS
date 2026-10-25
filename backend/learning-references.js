'use strict';

// Explicit editorial links, rather than keyword guesses or a module-wide fallback.
const training = {
  '2.1': [1,49,50], '2.8': [10,48], '2.3': [26,41,42,43,44],
  '3.1': [2,3,4,5,31,32,39], '3.2': [6,7,8,33], '2.9': [9],
  '6.2': [11,12,13,47], '3.4': [14], '4.8': [15,66], '4.2': [62,94], '4.10': [61],
  '4.3': [16,17,68,69,93],
  '5.2': [21,22,24,51,52,53,54,55,56,95,96], '5.1': [23,59],
  '3.3': [34,35,92], '3.9': [25,36,91], '3.10': [45], '7.1': [27,75], '7.4': [28,80],
  '8.2': [29], '1.2': [30], '3.6': [37,38,46], '3.11': [40],
  '5.3': [57,58,60], '4.4': [63,65], '4.7': [70], '4.5': [64,67],
  '7.2': [71,72,73,77,97], '7.3': [74,76,79,98], '7.5': [78],
  '8.4': [81,87,102], '8.1': [82,83,85,88,89], '1.6': [84,90,101], '6.3': [18,19,99,100], '6.6': [20,86]
};
// Entries correspond to Q61–Q120 in their original paper order.
const papers = {
  2023: `1.2 1.6 1.6 1.6 1.5 2.9 4.1 6.3 4.6 6.2
    4.1 1.5 2.9 4.1 4.4 1.4 6.3 4.5 6.4 6.4
    3.1 4.1 4.6 4.1 3.2 4.3 4.7 1.5 1.6 2.9
    8.1 6.4 1.5 1.6 3.1 1.4 2.2 4.6 3.3 4.2
    2.3 4.1 4.6 2.2 8.2 2.2 3.9 2.10 2.6 2.2
    2.2 3.9 5.3 2.2 2.2 3.3 3.10 2.3 3.10 3.10`,
  2024: `4.6 4.6 1.4 4.6 4.6 1.5 4.6 1.5 4.6 4.6
    1.5 4.6 4.6 3.9 2.3 1.5 2.5 4.6 3.6 1.4
    2.7 4.7 6.4 2.8 4.7 4.1 1.5 2.9 4.3 3.3
    8.1 4.9 3.1 1.5 3.1 1.4 3.5 2.3 4.5 2.3
    4.5 6.4 4.6 6.3 2.6 3.1 4.3 2.4 1.5 4.4
    2.11 1.7 1.6 4.2 6.3 4.3 2.11 3.2 8.4 4.7`,
  2025: `2.2 2.6 2.6 4.7 1.1 1.5 2.3 2.4 2.3 4.7
    4.7 3.1 3.6 3.10 3.9 3.6 3.3 4.6 3.2 2.2
    4.3 1.6 6.3 1.5 6.4 3.6 4.5 6.2 8.1 6.4
    6.3 7.1 2.5 2.9 2.6 6.2 6.2 6.6 2.7 3.6
    3.1 3.9 3.5 5.2 4.1 7.3 7.4 4.1 4.8 4.7
    4.5 8.4 1.5 1.4 1.5 6.4 4.3 1.4 4.3 8.4`
};
const notes = {
  2023069: 'الدرس يشرح علاقة القصد بالطريقة والتعديل؛ لا يثبت وحده نسبة العبارة إلى ميريو. حرف التصحيح مصدره الجدول المرفق بالورقة.',
  2023097: 'هذه إحالة لفهم نموذج فرويد التاريخي؛ لا تقدم المجزوءة دليلاً على النتيجة الشخصية المحددة في السؤال. قارن حرف التصحيح بالوثيقة المرفقة.',
  2023106: 'يراجع المحور اختلاف القراءات التحليلية. الحرف من جدول التصحيح المرفق؛ لا تتحول قراءة تاريخية لحالة هانز إلى تشخيص أو قاعدة عامة على الأطفال.',
  2023111: 'الإحالة لتمييز مفاهيم كلاين عن التعلق؛ لا تثبت النتيجة المحددة المنسوبة إليها في السؤال. المفتاح المرفق مصدر الحرف، وليس إرشاداً لرعاية الطفل.',
  2023115: 'المحور يقدم سياق النموذج الفرويدي؛ لا يثبت توقيت ظهور العنف لدى الأطفال. حافظ على التمييز بين مفتاح الورقة وبين وصف النمو الفعلي.',
  2024111: 'يشرح الدرس مراحل فالون وتكامل الوظائف؛ لا تثبت المقارنة أن المدارس اللاحقة استبدلت مفهوم المرحلة باسم واحد. يبقى السؤال غير محسوم.',
  2024112: 'الدرس يوضح سياق الرؤية؛ اختيار عبارة دقيقة يستلزم الرجوع إلى الوثيقة الأصلية. يبقى السؤال غير محسوم.',
  2024116: 'الإحالة لمفاهيم الأهداف وصياغة الأداء؛ صياغة «النظرية بالعمليات» في الورقة غير كافية لتوثيق المقصود، لذلك لا يحسم الجواب.',
  2024120: 'يعرض الدرس التعلم النشط، لكن تشابه المعنى لا يثبت صاحب الاقتباس. السؤال غير محسوم إلى حين توثيق النسبة.',
  2025070: 'يقارن الدرس مونتيسوري وفرينيه وفروبل؛ مصطلح المقاربة البديلة لا يحدد وحده صاحباً واحداً، ويبقى السؤال غير محسوم.',
  2025078: 'يشرح الدرس وظيفة الحوار والسؤال، لكن هذا التشابه لا يكفي لإثبات النسبة المطلوبة في الورقة.',
  2025101: 'افصل بين الإشراط الكلاسيكي والإجرائي والتعزيز؛ عبارة «التعزيز الكلاسيكي» ملتبسة في الورقة، فلا يستنتج منها مفتاح قطعي.'
};

function connectLearningReferences(catalog) {
  const sections = new Map(catalog.modules.flatMap(module => module.sections.map(section => [section.id,
    { moduleId: module.id, sectionId: section.id, title: section.title.replace(/^\d+\.\s*/, ''), sources: section.sources }])));
  const links = new Map();
  const add = (id, key) => {
    const [module, section] = key.split('.');
    const reference = sections.get(`mod-${module}-s${section}`);
    if (!reference) throw new Error(`Unknown lesson reference ${key}`);
    if (links.has(id)) throw new Error(`Duplicate question reference ${id}`);
    links.set(id, reference);
  };
  for (const [key, ids] of Object.entries(training)) for (const id of ids) add(id, key);
  for (const [year, list] of Object.entries(papers)) {
    const keys = list.trim().split(/\s+/);
    if (keys.length !== 60) throw new Error(`Incomplete lesson references for ${year}`);
    keys.forEach((key, index) => add(Number(year) * 1000 + 61 + index, key));
  }
  const connect = question => {
    const reference = links.get(question.id);
    if (!reference) throw new Error(`Missing lesson reference for question ${question.id}`);
    question.moduleId = reference.moduleId;
    question.category = catalog.modules.find(module => module.id === reference.moduleId).questionCategory;
    question.lessonReferences = [reference];
    const passage = question.sourceExamId === 'exam-2023' && question.examNumber <= 65 ||
      question.sourceExamId === 'exam-2024' && [61,62,64,65,67,69,70,72,73].includes(question.examNumber);
    question.learningNote = notes[question.id] || (passage
      ? 'دليل الجواب في نص الانطلاق المرفق بالامتحان. يشرح هذا المحور الخلفية المفاهيمية ويساعد على تحليل النص، ولا يحل محله.'
      : question.correctAnswer === null ? 'هذا المحور يشرح المفهوم للمراجعة؛ لا يكفي وحده لحسم صياغة السؤال أو نسبة العبارة. السؤال مستثنى من التنقيط.' : 'يربط هذا المحور التعليل بالمفهوم ومثاله التطبيقي؛ مراجع المحور تتيح متابعة الشرح في الأصل.');
    // These were reference questions with unsupported exam attributions, not archived paper transcriptions.
    if (question.id <= 30) question.source = `إحالة دراسية: ${reference.sources.map(source => source.title).join('؛ ')}`;
    return question;
  };
  catalog.quiz.forEach(connect);
  catalog.exams.forEach(exam => exam.questions.forEach(connect));
  return catalog;
}
module.exports = { connectLearningReferences };
