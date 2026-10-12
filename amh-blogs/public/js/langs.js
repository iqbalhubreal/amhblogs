/* The 12 languages (no Mandarin) + the small set of interface strings the public site needs. */
window.LANGS = [
  { code: 'en', name: 'English',          dir: 'ltr' },
  { code: 'hi', name: 'हिन्दी',            dir: 'ltr' },
  { code: 'es', name: 'Español',          dir: 'ltr' },
  { code: 'ar', name: 'العربية',          dir: 'rtl' },
  { code: 'fr', name: 'Français',         dir: 'ltr' },
  { code: 'bn', name: 'বাংলা',            dir: 'ltr' },
  { code: 'pt', name: 'Português',        dir: 'ltr' },
  { code: 'ru', name: 'Русский',          dir: 'ltr' },
  { code: 'ur', name: 'اردو',             dir: 'rtl' },
  { code: 'id', name: 'Bahasa Indonesia', dir: 'ltr' },
  { code: 'de', name: 'Deutsch',          dir: 'ltr' },
  { code: 'ja', name: '日本語',            dir: 'ltr' }
];

window.UI = {
  en: { topics: 'Topics', all: 'All posts', search: 'Search posts…', latest: 'Latest', minRead: 'min read', back: 'Back', empty: 'No posts yet.', notTranslated: 'This post isn’t available in your language yet. Showing the original.', share: 'Share', copied: 'Link copied', loadMore: 'Load more', about: 'About', notFound: 'This page could not be found.', results: 'Search results' },
  hi: { topics: 'विषय', all: 'सभी पोस्ट', search: 'पोस्ट खोजें…', latest: 'ताज़ा', minRead: 'मिनट पढ़ें', back: 'वापस', empty: 'अभी कोई पोस्ट नहीं।', notTranslated: 'यह पोस्ट अभी आपकी भाषा में उपलब्ध नहीं है। मूल पोस्ट दिखाई जा रही है।', share: 'साझा करें', copied: 'लिंक कॉपी हुआ', loadMore: 'और देखें', about: 'परिचय', notFound: 'यह पेज नहीं मिला।', results: 'खोज परिणाम' },
  es: { topics: 'Temas', all: 'Todas las entradas', search: 'Buscar entradas…', latest: 'Recientes', minRead: 'min de lectura', back: 'Volver', empty: 'Aún no hay entradas.', notTranslated: 'Esta entrada aún no está disponible en tu idioma. Se muestra el original.', share: 'Compartir', copied: 'Enlace copiado', loadMore: 'Ver más', about: 'Acerca de', notFound: 'No se encontró esta página.', results: 'Resultados de búsqueda' },
  ar: { topics: 'المواضيع', all: 'كل المقالات', search: 'ابحث في المقالات…', latest: 'الأحدث', minRead: 'دقائق قراءة', back: 'رجوع', empty: 'لا توجد مقالات بعد.', notTranslated: 'هذه المقالة غير متوفرة بلغتك بعد. يتم عرض النسخة الأصلية.', share: 'مشاركة', copied: 'تم نسخ الرابط', loadMore: 'عرض المزيد', about: 'نبذة', notFound: 'تعذّر العثور على هذه الصفحة.', results: 'نتائج البحث' },
  fr: { topics: 'Sujets', all: 'Tous les articles', search: 'Rechercher…', latest: 'Récents', minRead: 'min de lecture', back: 'Retour', empty: 'Aucun article pour le moment.', notTranslated: 'Cet article n’est pas encore disponible dans votre langue. Version originale affichée.', share: 'Partager', copied: 'Lien copié', loadMore: 'Voir plus', about: 'À propos', notFound: 'Cette page est introuvable.', results: 'Résultats de recherche' },
  bn: { topics: 'বিষয়', all: 'সব পোস্ট', search: 'পোস্ট খুঁজুন…', latest: 'সর্বশেষ', minRead: 'মিনিট পড়া', back: 'ফিরে যান', empty: 'এখনও কোনো পোস্ট নেই।', notTranslated: 'এই পোস্টটি এখনও আপনার ভাষায় উপলব্ধ নয়। মূল পোস্ট দেখানো হচ্ছে।', share: 'শেয়ার', copied: 'লিংক কপি হয়েছে', loadMore: 'আরও দেখুন', about: 'পরিচিতি', notFound: 'এই পাতাটি পাওয়া যায়নি।', results: 'অনুসন্ধানের ফলাফল' },
  pt: { topics: 'Tópicos', all: 'Todas as publicações', search: 'Pesquisar…', latest: 'Recentes', minRead: 'min de leitura', back: 'Voltar', empty: 'Ainda não há publicações.', notTranslated: 'Esta publicação ainda não está disponível no seu idioma. Mostrando o original.', share: 'Compartilhar', copied: 'Link copiado', loadMore: 'Ver mais', about: 'Sobre', notFound: 'Esta página não foi encontrada.', results: 'Resultados da pesquisa' },
  ru: { topics: 'Темы', all: 'Все записи', search: 'Поиск записей…', latest: 'Свежие', minRead: 'мин чтения', back: 'Назад', empty: 'Записей пока нет.', notTranslated: 'Эта запись пока недоступна на вашем языке. Показан оригинал.', share: 'Поделиться', copied: 'Ссылка скопирована', loadMore: 'Показать ещё', about: 'О блоге', notFound: 'Страница не найдена.', results: 'Результаты поиска' },
  ur: { topics: 'موضوعات', all: 'تمام تحریریں', search: 'تحریریں تلاش کریں…', latest: 'تازہ ترین', minRead: 'منٹ کا مطالعہ', back: 'واپس', empty: 'ابھی کوئی تحریر نہیں۔', notTranslated: 'یہ تحریر ابھی آپ کی زبان میں دستیاب نہیں۔ اصل تحریر دکھائی جا رہی ہے۔', share: 'شیئر کریں', copied: 'لنک کاپی ہو گیا', loadMore: 'مزید دیکھیں', about: 'تعارف', notFound: 'یہ صفحہ نہیں ملا۔', results: 'تلاش کے نتائج' },
  id: { topics: 'Topik', all: 'Semua tulisan', search: 'Cari tulisan…', latest: 'Terbaru', minRead: 'menit baca', back: 'Kembali', empty: 'Belum ada tulisan.', notTranslated: 'Tulisan ini belum tersedia dalam bahasa Anda. Menampilkan versi asli.', share: 'Bagikan', copied: 'Tautan disalin', loadMore: 'Muat lagi', about: 'Tentang', notFound: 'Halaman ini tidak ditemukan.', results: 'Hasil pencarian' },
  de: { topics: 'Themen', all: 'Alle Beiträge', search: 'Beiträge suchen…', latest: 'Neueste', minRead: 'Min. Lesezeit', back: 'Zurück', empty: 'Noch keine Beiträge.', notTranslated: 'Dieser Beitrag ist noch nicht in Ihrer Sprache verfügbar. Das Original wird angezeigt.', share: 'Teilen', copied: 'Link kopiert', loadMore: 'Mehr laden', about: 'Über', notFound: 'Diese Seite wurde nicht gefunden.', results: 'Suchergebnisse' },
  ja: { topics: 'トピック', all: 'すべての記事', search: '記事を検索…', latest: '新着', minRead: '分で読めます', back: '戻る', empty: 'まだ記事がありません。', notTranslated: 'この記事はまだお使いの言語では利用できません。原文を表示しています。', share: '共有', copied: 'リンクをコピーしました', loadMore: 'もっと見る', about: '概要', notFound: 'ページが見つかりません。', results: '検索結果' }
};
