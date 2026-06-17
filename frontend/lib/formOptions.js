// Mirrors the governorate/study-year lists used by the main registration
// form. Kept as a static list here (rather than fetched from the other
// Worker) so this dashboard has no cross-service dependency for its filters.

export const GOVERNORATES = [
  'القاهرة', 'الجيزة', 'الإسكندرية', 'الدقهلية', 'البحيرة',
  'الفيوم', 'الغربية', 'الإسماعيلية', 'المنوفية', 'المنيا',
  'القليوبية', 'الوادي الجديد', 'السويس', 'أسوان', 'أسيوط',
  'بني سويف', 'بورسعيد', 'دمياط', 'الشرقية', 'جنوب سيناء',
  'كفر الشيخ', 'مطروح', 'الأقصر', 'قنا', 'شمال سيناء', 'سوهاج', 'البحر الأحمر',
]; 

export const STUDY_YEARS = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة', 'خريج', 'ثانوية عامة'];
