/* Moroccan school-year labels and the fiche's Arabic/French presentation. */
const FICHE_CYCLES = [
  { id: 'primary', ar: 'التعليم الابتدائي', fr: 'Enseignement primaire', levels: [
    { id: 'p1', ar: 'الأولى ابتدائي', fr: '1re année primaire' }, { id: 'p2', ar: 'الثانية ابتدائي', fr: '2e année primaire' },
    { id: 'p3', ar: 'الثالثة ابتدائي', fr: '3e année primaire' }, { id: 'p4', ar: 'الرابعة ابتدائي', fr: '4e année primaire' },
    { id: 'p5', ar: 'الخامسة ابتدائي', fr: '5e année primaire' }, { id: 'p6', ar: 'السادسة ابتدائي', fr: '6e année primaire' }
  ] },
  { id: 'college', ar: 'التعليم الثانوي الإعدادي', fr: 'Secondaire collégial', levels: [
    { id: 'c1', ar: 'الأولى إعدادي', fr: '1re année collège' }, { id: 'c2', ar: 'الثانية إعدادي', fr: '2e année collège' },
    { id: 'c3', ar: 'الثالثة إعدادي', fr: '3e année collège' }
  ] },
  { id: 'lycee', ar: 'التعليم الثانوي التأهيلي', fr: 'Secondaire qualifiant — lycée', levels: [
    { id: 'tc', ar: 'الجذع المشترك', fr: 'Tronc commun' }, { id: 'bac1', ar: 'الأولى بكالوريا', fr: '1re année baccalauréat' },
    { id: 'bac2', ar: 'الثانية بكالوريا', fr: '2e année baccalauréat' }
  ] }
];
const FICHE_TEXT = {
  ar: {
    heading: 'خطط لتعلم أفضل', introduction: 'أنشئ جذاذة لأي مستوى في النظام المغربي، بالعربية أو بالفرنسية.',
    print: 'PDF / طباعة الجذاذة', printHint: 'طباعة A4 أفقية بنسبة 100%. اختر «Save as PDF / حفظ بصيغة PDF» وألغِ «Headers and footers / الرؤوس والتذييلات» لحذف التاريخ والعنوان اللذين يضيفهما المتصفح.',
    toComplete: 'يُستكمل', criteriaPrint: 'معايير التقويم', materialsPrint: 'الوسائل الديداكتيكية', studentRecovery: 'بعض أنشطة المتعلمين فارغة. أكمل المراحل أدناه أو استعد الأنشطة المقترحة من النموذج المطابق.', restoreStudents: 'استكمال أنشطة المتعلمين من النموذج',
    settings: 'المستوى ولغة الجذاذة', language: 'لغة الجذاذة', cycle: 'السلك التعليمي', level: 'المستوى الدراسي',
    track: 'الشعبة / المسلك (اختياري)', trackPlaceholder: 'مثال: علوم تجريبية، آداب، علوم رياضية...',
    school: 'المؤسسة', teacher: 'الأستاذ(ة)', sessionDate: 'تاريخ الحصة', duration: 'مدة الحصة', durationPlaceholder: 'مثال: 60 دقيقة',
    presets: 'نماذج قابلة للتعديل', science: 'النشاط العلمي', math: 'الرياضيات', lang: 'اللغة العربية',
    presetHint: 'النماذج أمثلة للتخطيط. اختر المستوى وكيّف الأهداف والأنشطة بما يناسب متعلميك.',
    drafts: 'جذاذاتي المحفوظة', newDraft: 'جذاذة جديدة', choose: 'اختر…', save: 'حفظ الآن', delete: 'حذف الجذاذة',
    reload: 'افتح النسخة المحفوظة', copy: 'احفظ تعديلاتي كنسخة جديدة', formHeading: 'معطيات التخطيط البيداغوجي',
    subject: 'المادة الدراسية', title: 'عنوان الدرس / الوحدة', competence: 'الكفاية المستهدفة', objectives: 'الأهداف التعلمية',
    pedagogy: 'المقاربة البيداغوجية', criteria: 'معايير ومؤشرات التقويم', support: 'الدعم والمعالجة', materials: 'الوسائل الديداكتيكية',
    allTracks: 'جميع المسالك', phaseDuration: 'المدة (دقيقة)', teacherActivities: 'أنشطة الأستاذ(ة)', studentActivities: 'أنشطة المتعلمين',
    phaseTotal: 'مجموع مدد المراحل', minutes: 'دقيقة', phasePartial: 'مجموع جزئي — أكمل مدد المراحل', invalidPhaseDuration: 'أدخل مدة صحيحة بين 0 و1440 دقيقة لكل مرحلة، أو اترك الحقل فارغا.',
    step1: 'أنشطة الأستاذ(ة)', step2: 'أنشطة الأستاذ(ة)', step3: 'أنشطة الأستاذ(ة)', step4: 'أنشطة الأستاذ(ة)',
    student1: 'أنشطة المتعلمين', student2: 'أنشطة المتعلمين', student3: 'أنشطة المتعلمين', student4: 'أنشطة المتعلمين',
    phaseDuration1: 'المدة (دقيقة)', phaseDuration2: 'المدة (دقيقة)', phaseDuration3: 'المدة (دقيقة)', phaseDuration4: 'المدة (دقيقة)',
    assessment1: 'تقويم ودعم المرحلة 1', assessment2: 'تقويم ودعم المرحلة 2', assessment3: 'تقويم ودعم المرحلة 3', assessment4: 'تقويم ودعم المرحلة 4',
    documentKind: 'بطاقة التخطيط البيداغوجي', scenario: 'سيناريو التعليم والتعلم', phase: 'المرحلة الديداكتيكية', activities: 'أنشطة التعليم والتعلم', assessment: 'التقويم والدعم البيداغوجي',
    phases: ['وضعية الانطلاق والتحسيس', 'التقصي وبناء المفهوم', 'الاستنتاج والمأسسة', 'الاستثمار والتقويم النهائي'],
    teacherSignature: 'توقيع الأستاذ(ة)', inspectorSignature: 'تأشيرة المفتش التربوي',
    logoAlt: 'شعار المملكة المغربية — وزارة التربية الوطنية والتعليم الأولي والرياضة بالعربية والأمازيغية',
    dirty: 'تعديلات غير محفوظة...', saving: 'جارٍ حفظ الجذاذة...', saved: 'تم حفظ الجذاذة في حسابك.', pending: 'تعديلات جديدة بانتظار الحفظ...',
    failed: 'تعذر حفظ الجذاذة. استخدم «حفظ الآن» لإعادة المحاولة.', opened: 'تم فتح الجذاذة المحفوظة.',
    deleting: 'جارٍ حذف الجذاذة...', deleted: 'تم حذف الجذاذة.',
    recovered: 'استعدنا تعديلات غير محفوظة. استخدم «حفظ الآن».', conflict: 'عُدلت الجذاذة في نافذة أخرى. افتح النسخة المحفوظة أو احفظ نسخة جديدة.',
    reloadConfirm: 'فتح النسخة المحفوظة سيستبدل التعديلات الحالية. هل تريد المتابعة؟', deleteConfirm: 'هل تريد حذف هذه الجذاذة من حسابك؟',
    missingTitle: 'أدخل عنوان الدرس قبل الحفظ.', filePrefix: 'جذاذة'
  },
  fr: {
    heading: 'Préparez vos séances', introduction: 'Créez une fiche pour tous les niveaux du système marocain, en arabe ou en français.',
    print: 'PDF / Imprimer la fiche', printHint: 'A4 paysage, échelle 100 %. Choisissez « Enregistrer au format PDF » et désactivez « En-têtes et pieds de page / Headers and footers » pour retirer la date et le titre ajoutés par le navigateur.',
    toComplete: 'À compléter', criteriaPrint: 'Critères d’évaluation', materialsPrint: 'Matériel et supports', studentRecovery: 'Certaines activités des élèves sont vides. Complétez les phases ci-dessous ou reprenez les activités proposées par le modèle correspondant.', restoreStudents: 'Compléter les activités des élèves depuis le modèle',
    settings: 'Niveau et langue de la fiche', language: 'Langue de la fiche', cycle: 'Cycle d’enseignement', level: 'Niveau scolaire',
    track: 'Filière / option (facultatif)', trackPlaceholder: 'Ex. : sciences expérimentales, lettres, sciences mathématiques…',
    school: 'Établissement', teacher: 'Enseignant(e)', sessionDate: 'Date de la séance', duration: 'Durée de la séance', durationPlaceholder: 'Ex. : 60 minutes',
    presets: 'Modèles à adapter', science: 'Activité scientifique', math: 'Mathématiques', lang: 'Langue arabe',
    presetHint: 'Les modèles sont des exemples de préparation. Choisissez le niveau et adaptez les objectifs et les activités à vos élèves.',
    drafts: 'Mes fiches enregistrées', newDraft: 'Nouvelle fiche', choose: 'Choisir…', save: 'Enregistrer', delete: 'Supprimer la fiche',
    reload: 'Ouvrir la version enregistrée', copy: 'Enregistrer une nouvelle copie', formHeading: 'Préparation pédagogique',
    subject: 'Discipline', title: 'Titre de la leçon / unité', competence: 'Compétence visée', objectives: 'Objectifs d’apprentissage',
    pedagogy: 'Approche pédagogique', criteria: 'Critères et indicateurs d’évaluation', support: 'Soutien et remédiation', materials: 'Supports et matériel didactiques',
    allTracks: 'Toutes les filières', phaseDuration: 'Durée (min)', teacherActivities: 'Activités de l’enseignant(e)', studentActivities: 'Activités des élèves',
    phaseTotal: 'Durée totale des phases', minutes: 'min', phasePartial: 'Total partiel — complétez les durées', invalidPhaseDuration: 'Saisissez une durée entière entre 0 et 1440 minutes par phase, ou laissez le champ vide.',
    step1: 'Activités de l’enseignant(e)', step2: 'Activités de l’enseignant(e)', step3: 'Activités de l’enseignant(e)', step4: 'Activités de l’enseignant(e)',
    student1: 'Activités des élèves', student2: 'Activités des élèves', student3: 'Activités des élèves', student4: 'Activités des élèves',
    phaseDuration1: 'Durée (min)', phaseDuration2: 'Durée (min)', phaseDuration3: 'Durée (min)', phaseDuration4: 'Durée (min)',
    assessment1: 'Évaluation et soutien — phase 1', assessment2: 'Évaluation et soutien — phase 2', assessment3: 'Évaluation et soutien — phase 3', assessment4: 'Évaluation et soutien — phase 4',
    documentKind: 'Fiche de préparation pédagogique', scenario: 'Déroulement de la séance', phase: 'Phase didactique', activities: 'Activités d’enseignement et d’apprentissage', assessment: 'Évaluation et soutien pédagogique',
    phases: ['Mise en situation et mobilisation', 'Investigation et construction', 'Synthèse et institutionnalisation', 'Réinvestissement et évaluation'],
    teacherSignature: 'Signature de l’enseignant(e)', inspectorSignature: 'Visa de l’inspecteur pédagogique',
    logoAlt: 'Logo du Royaume du Maroc — Ministère de l’Éducation nationale, du Préscolaire et des Sports, en arabe et en amazigh',
    dirty: 'Modifications non enregistrées…', saving: 'Enregistrement en cours…', saved: 'La fiche est enregistrée dans votre compte.', pending: 'Nouvelles modifications à enregistrer…',
    failed: 'Impossible d’enregistrer la fiche. Cliquez sur « Enregistrer » pour réessayer.', opened: 'La fiche enregistrée est ouverte.',
    deleting: 'Suppression de la fiche…', deleted: 'La fiche a été supprimée.',
    recovered: 'Des modifications non enregistrées ont été récupérées. Cliquez sur « Enregistrer ».', conflict: 'Cette fiche a été modifiée dans une autre fenêtre. Ouvrez la version enregistrée ou créez une nouvelle copie.',
    reloadConfirm: 'Ouvrir la version enregistrée remplacera les modifications actuelles. Continuer ?', deleteConfirm: 'Voulez-vous supprimer cette fiche de votre compte ?',
    missingTitle: 'Saisissez le titre de la leçon avant d’enregistrer.', filePrefix: 'Fiche'
  }
};
const FICHE_OPTIONS = {
  ar: {
    pedagogy: ['نهج التقصي وبيداغوجيا حل المشكلات', 'البيداغوجيا الفارقية (مجموعات المهام)', 'بيداغوجيا المشروع التشاركي', 'بيداغوجيا الخطأ والصراع المعرفي'],
    support: ['دعم مندمج فوري عبر التغذية الراجعة وتعديل التمثلات الخاطئة', 'دعم دوري (أسبوع الدعم والتثبيت Arrêt-bilan)', 'دعم مؤسساتي وفق مقاربة التدريس بالمسار المناسب TaRL']
  },
  fr: {
    pedagogy: ['Démarche d’investigation et résolution de problèmes', 'Pédagogie différenciée (groupes de tâches)', 'Pédagogie de projet collaboratif', 'Pédagogie de l’erreur et conflit cognitif'],
    support: ['Soutien intégré immédiat par rétroaction et ajustement des représentations', 'Soutien périodique (semaine de consolidation et arrêt-bilan)', 'Soutien institutionnel selon l’approche TaRL']
  }
};
const FICHE_PRESETS_FR = {
  science: {
    subject: 'Activité scientifique — enseignement primaire', title: 'La respiration des êtres vivants et les échanges gazeux',
    competence: 'Résoudre des situations-problèmes en mobilisant les connaissances relatives aux fonctions vitales et à l’adaptation des êtres vivants.',
    objectives: '1. Identifier le rôle des branchies dans la respiration aquatique.\n2. Comparer la respiration pulmonaire et la respiration branchiale.',
    pedagogy: FICHE_OPTIONS.fr.pedagogy[0], criteria: 'Identifier l’organe respiratoire adapté et expliquer sa fonction avec un vocabulaire scientifique précis.',
    support: FICHE_OPTIONS.fr.support[0], materials: 'Images d’un poisson et d’un être humain, documents expérimentaux, maquettes des organes respiratoires',
    step1: 'Observer les mouvements de la bouche et des branchies d’un poisson dans l’eau. Recueillir les hypothèses des élèves sur sa respiration.',
    step2: 'Étudier des documents expérimentaux en groupes, comparer la respiration du poisson et de l’être humain, puis justifier les hypothèses.',
    step3: 'Construire une synthèse sur les branchies, les poumons et les échanges gazeux. Stabiliser le vocabulaire scientifique.',
    step4: 'Réinvestir les acquis dans une nouvelle situation concernant la respiration de la grenouille sur terre et dans l’eau.',
    assessment1: 'Évaluer les représentations initiales sans correction prématurée.', assessment2: 'Observer les démarches et aider les élèves à interpréter les observations.',
    assessment3: 'Vérifier la précision de la synthèse et la distinction entre branchies et poumons.', assessment4: 'Expliquer le rôle de l’organe respiratoire et proposer un support aux élèves en difficulté.'
  },
  math: {
    subject: 'Mathématiques — secondaire collégial', title: 'Équations du premier degré à une inconnue',
    competence: 'Modéliser des situations concrètes par des équations et les résoudre en s’appuyant sur un raisonnement logique.',
    objectives: '1. Reconnaître une équation et sa solution.\n2. Résoudre une équation de la forme ax + b = c en utilisant les propriétés de l’égalité.',
    pedagogy: FICHE_OPTIONS.fr.pedagogy[1], criteria: 'Choisir les opérations adaptées, conserver l’égalité et vérifier la solution par substitution.',
    support: FICHE_OPTIONS.fr.support[1], materials: 'Fiches de problèmes, schéma d’une balance, tableau, exercices gradués',
    step1: 'Présenter un problème d’achat avec un prix inconnu. Recueillir les démarches proposées pour le déterminer.',
    step2: 'Traduire le problème par une équation. En groupes, effectuer la même opération sur les deux membres de l’égalité.',
    step3: 'Formuler les règles de résolution de ax + b = c. Préciser les conditions de division et vérifier par substitution.',
    step4: 'Résoudre de nouveaux problèmes de difficulté progressive et interpréter les solutions dans leur contexte.',
    assessment1: 'Repérer la compréhension de l’égalité et des opérations inverses.', assessment2: 'Observer les étapes de résolution et remédier aux erreurs de transformation.',
    assessment3: 'Demander aux élèves de justifier la conservation de l’égalité.', assessment4: 'Vérifier par substitution et proposer des exercices de remédiation gradués.'
  },
  lang: {
    subject: 'Langue arabe — secondaire qualifiant', title: 'Analyse d’un texte en prose : le discours journalistique',
    competence: 'Comprendre les caractéristiques du discours journalistique et mobiliser les outils d’analyse et de communication pour produire un texte structuré.',
    objectives: '1. Repérer les procédés d’information et de reportage.\n2. Analyser les champs lexicaux et la dimension persuasive d’un article.',
    pedagogy: FICHE_OPTIONS.fr.pedagogy[2], criteria: 'Citer le texte, distinguer information et opinion, et organiser une analyse dans une langue correcte.',
    support: FICHE_OPTIONS.fr.support[2], materials: 'Article de presse adapté, grille d’analyse, dictionnaire, feuilles de travail',
    step1: 'Lire le titre et l’image, anticiper le sujet de l’article et discuter le rôle de la presse.',
    step2: 'Lire l’article en groupes. Repérer l’idée générale, les champs lexicaux et la distinction entre faits et opinions.',
    step3: 'Synthétiser les caractéristiques du discours journalistique et organiser les résultats de l’analyse avec des citations.',
    step4: 'Analyser un nouvel extrait et rédiger une brève en s’appuyant sur une grille de critères.',
    assessment1: 'Évaluer la compréhension du vocabulaire et les hypothèses de lecture.', assessment2: 'Donner une rétroaction sur les citations et la distinction entre information et opinion.',
    assessment3: 'Vérifier la cohérence de l’analyse et la validité des conclusions.', assessment4: 'Évaluer la production et soutenir la compréhension, l’organisation et la langue.'
  }
};
if (typeof module !== 'undefined' && module.exports) module.exports = { FICHE_CYCLES };
