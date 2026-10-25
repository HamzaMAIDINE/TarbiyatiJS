/* Stable IDs keep the selected Moroccan stream when the fiche language changes.
 * Sources: HCP Annuaire statistique 2025 (enseignement); MEN Guide du candidat 2025,
 * pp. 3–4; MEN baccalauréat 2026. Source links are recorded in README.md.
 * The catalogue includes general, international, technical and professional streams.
 */
const FICHE_TRACKS = [
  ['tc-sciences', 'tc', 'general', 'الجذع المشترك العلمي', 'Tronc commun scientifique'],
  ['tc-lettres', 'tc', 'general', 'الجذع المشترك للآداب والعلوم الإنسانية', 'Tronc commun lettres et sciences humaines'],
  ['tc-technologique', 'tc', 'general', 'الجذع المشترك التكنولوجي', 'Tronc commun technologique'],
  ['tc-originel', 'tc', 'general', 'الجذع المشترك للتعليم الأصيل', 'Tronc commun enseignement originel'],
  ['bac1-experimentales', 'bac1', 'general', 'العلوم التجريبية', 'Sciences expérimentales'],
  ['bac1-mathematiques', 'bac1', 'general', 'العلوم الرياضية', 'Sciences mathématiques'],
  ['bac1-lettres', 'bac1', 'general', 'الآداب والعلوم الإنسانية', 'Lettres et sciences humaines'],
  ['bac1-economie', 'bac1', 'general', 'العلوم الاقتصادية والتدبير', 'Sciences économiques et gestion'],
  ['bac1-charia', 'bac1', 'general', 'العلوم الشرعية', 'Sciences de la charia'],
  ['bac1-arabe', 'bac1', 'general', 'اللغة العربية', 'Langue arabe'],
  ['bac2-physiques', 'bac2', 'general', 'العلوم الفيزيائية', 'Sciences physiques'],
  ['bac2-svt', 'bac2', 'general', 'علوم الحياة والأرض', 'Sciences de la vie et de la Terre'],
  ['bac2-maths-a', 'bac2', 'general', 'العلوم الرياضية أ', 'Sciences mathématiques A'],
  ['bac2-maths-b', 'bac2', 'general', 'العلوم الرياضية ب', 'Sciences mathématiques B'],
  ['bac2-agricoles', 'bac2', 'general', 'العلوم الزراعية', 'Sciences agronomiques'],
  ['bac2-lettres', 'bac2', 'general', 'الآداب', 'Lettres'],
  ['bac2-humaines', 'bac2', 'general', 'العلوم الإنسانية', 'Sciences humaines'],
  ['bac2-economie', 'bac2', 'general', 'العلوم الاقتصادية', 'Sciences économiques'],
  ['bac2-gestion', 'bac2', 'general', 'علوم التدبير المحاسباتي', 'Sciences de gestion comptable'],
  ['bac2-charia', 'bac2', 'general', 'العلوم الشرعية', 'Sciences de la charia'],
  ['bac2-arabe', 'bac2', 'general', 'اللغة العربية', 'Langue arabe'],
  ['stm', 'bac1,bac2', 'technical', 'العلوم والتكنولوجيات الميكانيكية', 'Sciences et technologies mécaniques'],
  ['ste', 'bac1,bac2', 'technical', 'العلوم والتكنولوجيات الكهربائية', 'Sciences et technologies électriques'],
  ['arts-appliques', 'bac1,bac2', 'technical', 'الفنون التطبيقية', 'Arts appliqués'],
  ['pro-industrie', 'tc', 'professional', 'الجذع المشترك المهني الصناعي', 'Tronc commun professionnel industriel'],
  ['pro-services', 'tc', 'professional', 'الجذع المشترك المهني للخدمات', 'Tronc commun professionnel services'],
  ['pro-agriculture', 'tc', 'professional', 'الجذع المشترك المهني الفلاحي', 'Tronc commun professionnel agricole'],
  ['pro-maintenance-industrielle', 'bac1,bac2', 'professional', 'الصيانة الصناعية', 'Maintenance industrielle'],
  ['pro-mecanique', 'bac1,bac2', 'professional', 'التصنيع الميكانيكي', 'Fabrication mécanique'],
  ['pro-electrotechnique', 'bac1,bac2', 'professional', 'الإلكتروتقنية وأجهزة التواصل', 'Électrotechnique et appareils communicants'],
  ['pro-automobile', 'bac1,bac2', 'professional', 'صيانة المركبات المتحركة (خيار السيارات)', 'Maintenance des véhicules automobiles'],
  ['pro-aeronautique', 'bac1,bac2', 'professional', 'صناعة الطائرات', 'Construction aéronautique'],
  ['pro-construction-metallique', 'bac1,bac2', 'professional', 'صناعة البنيات المعدنية', 'Construction métallique'],
  ['pro-bois', 'bac1,bac2', 'professional', 'فنون وتقنيات الخشب', 'Arts et techniques du bois'],
  ['pro-gros-oeuvre', 'bac1,bac2', 'professional', 'أوراش البناء', 'Gros œuvre du bâtiment'],
  ['pro-froid', 'bac1,bac2', 'professional', 'التبريد والتكييف', 'Froid et conditionnement d’air'],
  ['pro-informatique', 'bac1,bac2', 'professional', 'الصيانة المعلوماتية والشبكات', 'Maintenance informatique et réseaux'],
  ['pro-electronique', 'bac1,bac2', 'professional', 'النظم الإلكترونية والرقمية', 'Systèmes électroniques et numériques'],
  ['pro-energies', 'bac1,bac2', 'professional', 'الطاقات المتجددة', 'Énergies renouvelables'],
  ['pro-comptabilite', 'bac1,bac2', 'professional', 'التدبير المحاسباتي', 'Gestion comptable'],
  ['pro-commerce', 'bac1,bac2', 'professional', 'التجارة', 'Commerce'],
  ['pro-logistique', 'bac1,bac2', 'professional', 'اللوجستيك', 'Logistique'],
  ['pro-cuisine', 'bac1,bac2', 'professional', 'فنون الطبخ', 'Arts culinaires'],
  ['pro-restauration', 'bac1,bac2', 'professional', 'خدمات المطعمة', 'Services de restauration'],
  ['pro-reception', 'bac1,bac2', 'professional', 'الاستقبال الفندقي', 'Réception hôtelière'],
  ['pro-mode', 'bac1,bac2', 'professional', 'تصميم الأزياء', 'Design de mode'],
  ['pro-administration', 'bac1,bac2', 'professional', 'التسيير والإدارة', 'Gestion et administration'],
  ['pro-agricole', 'bac1,bac2', 'professional', 'تسيير ضيعة فلاحية', 'Conduite d’une exploitation agricole']
].map(([id, levels, group, ar, fr]) => ({ id, levels: levels.split(','), group, ar, fr }));
// International options listed in HCP 2025, pp. 299–300.
const FICHE_INTERNATIONAL_OPTIONS = {
  'tc-sciences': ['fr', 'en', 'es', 'sport'], 'tc-lettres': ['fr', 'en', 'es', 'sport'],
  'bac1-experimentales': ['fr', 'en', 'es', 'sport'], 'bac1-mathematiques': ['fr', 'en'],
  'bac1-lettres': ['fr', 'en', 'es', 'sport'], 'bac2-physiques': ['fr', 'en', 'es'],
  'bac2-svt': ['fr', 'en'], 'bac2-maths-a': ['fr', 'en'], 'bac2-maths-b': ['fr', 'en'],
  'bac2-lettres': ['fr', 'en', 'es', 'sport'], 'bac2-humaines': ['fr', 'en', 'es', 'sport']
};
for (const track of FICHE_TRACKS.filter(item => Object.hasOwn(FICHE_INTERNATIONAL_OPTIONS, item.id))) {
  for (const [id, ar, fr] of [['fr', 'خيار فرنسية', 'option français'], ['en', 'خيار إنجليزية', 'option anglais'], ['es', 'خيار إسبانية', 'option espagnol'], ['sport', 'خيار رياضة ودراسة', 'option sport-études']]) {
    if (!FICHE_INTERNATIONAL_OPTIONS[track.id].includes(id)) continue;
    FICHE_TRACKS.push({ ...track, id: track.id + '-' + id, group: 'international', ar: track.ar + ' — ' + ar, fr: track.fr + ' — ' + fr });
  }
}
const FICHE_TRACK_GROUPS = {
  ar: { general: 'التعليم العام والأصيل', international: 'المسالك الدولية', technical: 'التعليم التقني', professional: 'البكالوريا المهنية' },
  fr: { general: 'Enseignement général et originel', international: 'Options internationales', technical: 'Enseignement technique', professional: 'Baccalauréat professionnel' }
};
if (typeof module !== 'undefined' && module.exports) module.exports = { FICHE_TRACKS };
