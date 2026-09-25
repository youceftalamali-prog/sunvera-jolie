/**
 * Complete Algerian administrative dataset (58 wilayas).
 * Each entry: [code, nameAr, nameFr, nameEn, deliveryFee(DZD), etaDays, communes[]]
 * Commune entries are "Arabic|French"; the English name defaults to the French one
 * and everything stays editable from the Admin Dashboard (/admin/shipping),
 * so future administrative changes never require code changes.
 */
export type WilayaSeed = {
  code: string;
  nameAr: string;
  nameFr: string;
  nameEn: string;
  fee: number;
  eta: string;
  communes: { nameAr: string; nameFr: string; nameEn: string }[];
};

type Raw = [string, string, string, string, number, string, string[]];

const RAW: Raw[] = [
  ["01", "أدرار", "Adrar", "Adrar", 1200, "5-8", ["أدرار|Adrar", "رقان|Reggane", "تيميمون|Timimoun", "أولف|Aoulef", "تسابيت|Tsabit", "زاوية كنتة|Zaouiet Kounta", "فنوغيل|Fenoughil" ]],
  ["02", "الشلف", "Chlef", "Chlef", 700, "3-5", ["الشلف|Chlef", "تنس|Ténès", "بوقادير|Boukadir", "الأبيض مجاجة|Ouled Fares", "الكريمية|El Karimia", "أولاد بن عبد القادر|Ouled Ben Abdelkader", "الشطية|Chettia", "سنجاس|Sénia" ]],
  ["03", "الأغواط", "Laghouat", "Laghouat", 900, "4-7", ["الأغواط|Laghouat", "أفلو|Aflou", "حاسي الرمل|Hassi R'Mel", "قصر الحيران|Ksar El Hirane", "عين ماضي|Aïn Madhi", "بريدة|Brida" ]],
  ["04", "أم البواقي", "Oum El Bouaghi", "Oum El Bouaghi", 700, "3-5", ["أم البواقي|Oum El Bouaghi", "عين البيضاء|Aïn Beïda", "عين مليلة|Aïn M'lila", "عين فكرون|Aïn Fakroun", "مسكيانة|Meskiana", "الطلعة|El Belala" ]],
  ["05", "باتنة", "Batna", "Batna", 700, "3-5", ["باتنة|Batna", "بريكة|Barika", "عين التوتة|Aïn Touta", "مروانة|Merouana", "أريس|Arris", "نقاوس|N'Gaous", "تازولت|Tazoult", "سريانة|Seriana" ]],
  ["06", "بجاية", "Béjaïa", "Béjaïa", 650, "2-4", ["بجاية|Béjaïa", "أقبو|Akbou", "خراطة|Kherrata", "القصر|El Kseur", "سيدي عيش|Sidi Aïch", "تيشي|Tichy", "أميزور|Amizour", "سوق الاثنين|Souk El Tenine" ]],
  ["07", "بسكرة", "Biskra", "Biskra", 800, "3-6", ["بسكرة|Biskra", "طولقة|Tolga", "سيدي عقبة|Sidi Okba", "زريبة الوادي|Zeribet El Oued", "أولاد جلال|Ouled Djellal", "الوطاية|El Outaya" ]],
  ["08", "بشار", "Béchar", "Béchar", 1100, "5-8", ["بشار|Béchar", "القنادسة|Kenadsa", "العبادلة|Abadla", "بني ونيف|Beni Ounif", "تاغيت|Taghit", "لحمر|Lahmar" ]],
  ["09", "البليدة", "Blida", "Blida", 500, "1-3", ["البليدة|Blida", "بوفاريك|Boufarik", "أولاد يعيش|Ouled Yaïch", "بوقرة|Bougara", "الأربعاء|Larbaa", "موزاية|Mouzaïa", "بني مراد|Beni Mered", "الشبلي|Chiffa", "صومعة|Soumaa" ]],
  ["10", "البويرة", "Bouira", "Bouira", 600, "2-4", ["البويرة|Bouira", "الأخضرية|Lakhdaria", "سور الغزلان|Sour El Ghozlane", "عين البصام|Aïn El Bessam", "برج أوخريص|Bordj Okhriss", "مشدالة|M'Chedallah" ]],
  ["11", "تمنراست", "Tamanrasset", "Tamanrasset", 1300, "5-8", ["تمنراست|Tamanrasset", "عين صالح|In Salah", "عين قزام|In Guezzam", "أبلسة|Abalessa", "إدلس|Idles" ]],
  ["12", "تبسة", "Tébessa", "Tébessa", 750, "3-5", ["تبسة|Tébessa", "بئر العاتر|Bir El Ater", "الشريعة|Cheria", "الونزة|Ouenza", "مرسط|Morsott", "نقرين|Negrine" ]],
  ["13", "تلمسان", "Tlemcen", "Tlemcen", 750, "3-5", ["تلمسان|Tlemcen", "مغنية|Maghnia", "الرمشي|Remchi", "غزاوة|Ghazaouet", "منصورة|Mansourah", "شتوان|Chetouane", "بني بوسعيد|Beni Boussaid" ]],
  ["14", "تيارت", "Tiaret", "Tiaret", 750, "3-5", ["تيارت|Tiaret", "السوقر|Sougueur", "فرندة|Frenda", "مهدية|Mahdia", "عين الذهب|Aïn Dheb", "قصر الشلالة|Ksar Chellala" ]],
  ["15", "تيزي وزو", "Tizi Ouzou", "Tizi Ouzou", 600, "2-4", ["تيزي وزو|Tizi Ouzou", "عزازقة|Azazga", "ذراع بن خدة|Draâ Ben Khedda", "بوغني|Boghni", "تيزي راشد|Tizi Rached", "لربعاء ناث ايراثن|Larbaâ Nath Irathen", "تيقزيرت|Tigzirt", "أزفون|Azeffoun" ]],
  ["16", "الجزائر", "Alger", "Algiers", 400, "1-2", ["باب الزوار|Bab Ezzouar", "حيدرة|Hydra", "بئر مراد رايس|Bir Mourad Raïs", "الأبيار|El Biar", "القبة|Kouba", "الشراقة|Chéraga", "الدرارية|Draria", "دار البيضاء|Dar El Beïda", "بولوغين|Bologhine", "بئر خادم|Birkhadem", "سيدي امحمد|Sidi M'Hamed", "الحراش|El Harrach", "براقي|Baraki", "الرغاية|Rouiba", "بوزريعة|Bouzareah", "دالي إبراهيم|Dély Ibrahim", "عين البنيان|Aïn Benian", "زرالدة|Zeralda", "باب الوادي|Bab El Oued", "حسين داي|Hussein Dey" ]],
  ["17", "الجلفة", "Djelfa", "Djelfa", 800, "3-6", ["الجلفة|Djelfa", "عين وسارة|Aïn Oussera", "مسعد|Messaad", "حاسي بحبح|Hassi Bahbah", "الإدريسية|El Idrissia", "دار الشيوخ|Dar Chioukh" ]],
  ["18", "جيجل", "Jijel", "Jijel", 700, "3-5", ["جيجل|Jijel", "الطاهير|Taher", "الميلية|El Milia", "الشقفة|Chekfa", "العنصر|El Ancer", "زيامة منصورية|Ziama Mansouriah" ]],
  ["19", "سطيف", "Sétif", "Sétif", 600, "2-4", ["سطيف|Sétif", "العلمة|El Eulma", "عين ولمان|Aïn Oulmène", "بوقاعة|Bougaa", "عين الكبيرة|Aïn Kebira", "عين أرنات|Aïn Arnat", "جميلة|Djemila", "بابور|Babor" ]],
  ["20", "سعيدة", "Saïda", "Saïda", 800, "3-5", ["سعيدة|Saïda", "عين الحجر|Aïn El Hadjar", "أولاد براهيم|Ouled Brahim", "يوب|Youb", "عين السخونة|Aïn Sekhouna" ]],
  ["21", "سكيكدة", "Skikda", "Skikda", 700, "3-5", ["سكيكدة|Skikda", "عزابة|Azzaba", "القل|Collo", "الحروش|El Harrouch", "تمالوس|Tamalous", "رمضان جمال|Ramdane Djamel" ]],
  ["22", "سيدي بلعباس", "Sidi Bel Abbès", "Sidi Bel Abbès", 750, "3-5", ["سيدي بلعباس|Sidi Bel Abbès", "تلاغ|Telagh", "عين البرد|Aïn El Berd", "سفيزف|Sfisef", "مرحوم|Marhoum", "بوجبهة|Boudjebaa" ]],
  ["23", "عنابة", "Annaba", "Annaba", 650, "2-4", ["عنابة|Annaba", "الحجار|El Hadjar", "البوني|El Bouni", "سرايدي|Seraïdi", "برحال|Berrahal", "عين الباردة|Aïn El Berda" ]],
  ["24", "قالمة", "Guelma", "Guelma", 700, "3-5", ["قالمة|Guelma", "وادي الزناتي|Oued Zenati", "حمام دباغ|Hammam Debagh", "بوشقوف|Bouchegouf", "هيليوبوليس|Héliopolis" ]],
  ["25", "قسنطينة", "Constantine", "Constantine", 600, "2-4", ["قسنطينة|Constantine", "الخروب|El Khroub", "حامة بوزيان|Hamma Bouziane", "ديدوش مراد|Didouche Mourad", "عين السمارة|Aïn Smara", "زيغود يوسف|Zighoud Youcef" ]],
  ["26", "المدية", "Médéa", "Médéa", 600, "2-4", ["المدية|Médéa", "البرواقية|Berrouaghia", "قصر البخاري|Ksar El Boukhari", "عين بوسيف|Aïn Boucif", "تابلاط|Tablat", "أولاد عنتر|Ouled Antar" ]],
  ["27", "مستغانم", "Mostaganem", "Mostaganem", 700, "3-5", ["مستغانم|Mostaganem", "عين تادلس|Aïn Tédelès", "حاسي مماش|Hassi Mameche", "ماسرة|Mesra", "بوقيراط|Bouguirat", "سيدي علي|Sidi Ali" ]],
  ["28", "المسيلة", "M'Sila", "M'Sila", 700, "3-5", ["المسيلة|M'Sila", "بوسعادة|Bou Saâda", "سيدي عيسى|Sidi Aïssa", "عين الملح|Aïn El Melh", "مقرة|Magra", "حمام الضلعة|Hammam Dalaa" ]],
  ["29", "معسكر", "Mascara", "Mascara", 750, "3-5", ["معسكر|Mascara", "سيق|Sig", "محمدية|Mohammadia", "غريس|Ghriss", "تيغنيف|Tighennif", "بوهني|Bouhanifia" ]],
  ["30", "ورقلة", "Ouargla", "Ouargla", 950, "4-7", ["ورقلة|Ouargla", "حاسي مسعود|Hassi Messaoud", "الرويسات|Rouissat", "انقوسة|N'Goussa", "سيدي خويلد|Sidi Khouiled" ]],
  ["31", "وهران", "Oran", "Oran", 600, "2-4", ["وهران|Oran", "السانية|Es Sénia", "بئر الجير|Bir El Djir", "عين الترك|Aïn El Turk", "أرزيو|Arzew", "بطيوة|Bethioua", "قديل|Gdyel", "مسرغين|Mers El Kébir", "بوتليليس|Boutlélis" ]],
  ["32", "البيض", "El Bayadh", "El Bayadh", 950, "4-6", ["البيض|El Bayadh", "بوقطب|Bougtoub", "الأبيض سيدي الشيخ|El Abiodh Sidi Cheikh", "رقاصة|Rogassa", "بريزينة|Brezina" ]],
  ["33", "إليزي", "Illizi", "Illizi", 1400, "6-9", ["إليزي|Illizi", "إن أمناس|In Amenas", "برج عمر إدريس|Bordj Omar Driss", "دبداب|Debdeb" ]],
  ["34", "برج بوعريريج", "Bordj Bou Arreridj", "Bordj Bou Arreridj", 600, "2-4", ["برج بوعريريج|Bordj Bou Arreridj", "رأس الوادي|Ras El Oued", "المنصورة|Mansoura", "بئر قاصد علي|Bir Kasdali", "الحمادية|El Hamadia" ]],
  ["35", "بومرداس", "Boumerdès", "Boumerdès", 500, "1-3", ["بومرداس|Boumerdès", "برج منايل|Bordj Menaïel", "دلس|Dellys", "خميس الخشنة|Khemis El Khechna", "الثنية|Thenia", "الناصرية|Naciria", "تيجلابين|Tidjelabine", "بودواو|Boudouaou" ]],
  ["36", "الطارف", "El Tarf", "El Tarf", 700, "3-5", ["الطارف|El Tarf", "القالة|El Kala", "بوثلجة|Bouteldja", "بن مهيدي|Ben M'Hidi", "الذرعان|Dréan" ]],
  ["37", "تندوف", "Tindouf", "Tindouf", 1500, "6-9", ["تندوف|Tindouf", "أولادية|Oum El Assel" ]],
  ["38", "تيسمسيلت", "Tissemsilt", "Tissemsilt", 750, "3-5", ["تيسمسيلت|Tissemsilt", "ثنية الأحد|Theniet El Had", "برج بونعامة|Bordj Bounaama", "خميس مليانة|Khemisti", "لرجام|Lardjem" ]],
  ["39", "الوادي", "El Oued", "El Oued", 950, "4-7", ["الوادي|El Oued", "الرباح|Robbah", "قمار|Guemar", "الرقيبة|Reguiba", "الدبيلة|Debila", "حاسي خليفة|Hassi Khelifa" ]],
  ["40", "خنشلة", "Khenchela", "Khenchela", 800, "3-6", ["خنشلة|Khenchela", "قايس|Kais", "ششار|Chechar", "ببار|Babar", "المحمل|El Hamma" ]],
  ["41", "سوق أهراس", "Souk Ahras", "Souk Ahras", 750, "3-5", ["سوق أهراس|Souk Ahras", "سدراتة|Sedrata", "مداوروش|M'Daourouch", "تاورة|Taoura", "الحنانشة|Hanencha" ]],
  ["42", "تيبازة", "Tipaza", "Tipaza", 450, "1-3", ["تيبازة|Tipaza", "القليعة|Koléa", "حجوط|Hadjout", "الدواودة|Douaouda", "فوكة|Fouka", "بو إسماعيل|Bou Ismaïl", "شرشال|Cherchell", "حمر العين|Hammam Righa" ]],
  ["43", "ميلة", "Mila", "Mila", 650, "2-4", ["ميلة|Mila", "شلغوم العيد|Chelghoum Laïd", "فرجيوة|Ferdjioua", "تاجنانت|Tadjenanet", "وادي العثمانية|Oued Endja", "عين البيضاء أحريش|Aïn Beïda Harriche" ]],
  ["44", "عين الدفلى", "Aïn Defla", "Aïn Defla", 650, "2-4", ["عين الدفلى|Aïn Defla", "خميس مليانة|Khemis Miliana", "مليانة|Miliana", "العطاف|El Attaf", "الأبيض مجاجة|El Abadia", "بومدفع|Boumedfaa" ]],
  ["45", "النعامة", "Naâma", "Naâma", 1000, "4-7", ["النعامة|Naâma", "مشرية|Mécheria", "عين الصفراء|Aïn Sefra", "سيق|Sfissifa", "تيوت|Tiout" ]],
  ["46", "عين تموشنت", "Aïn Témouchent", "Aïn Témouchent", 750, "3-5", ["عين تموشنت|Aïn Témouchent", "بني صاف|Beni Saf", "حمام بوحجر|Hammam Bou Hadjar", "المالح|El Malah", "الأمير عبد القادر|Emir Abdelkader" ]],
  ["47", "غرداية", "Ghardaïa", "Ghardaïa", 950, "4-7", ["غرداية|Ghardaïa", "متليلي|Metlili", "بريان|Berriane", "القرارة|Guerrara", "زلفانة|Zelfana", "بونورة|Bounoura" ]],
  ["48", "غليزان", "Relizane", "Relizane", 700, "3-5", ["غليزان|Relizane", "وادي رهيو|Oued Rhiou", "مازونة|Mazouna", "عمي موسى|Ammi Moussa", "زمورة|Zemmoura", "جديوية|Djidiouia" ]],
  ["49", "تيميمون", "Timimoun", "Timimoun", 1300, "5-8", ["تيميمون|Timimoun", "أوقروت|Ouled Saïd", "شروين|Charouine", "المطارفة|Metarfa", "طالمين|Talmine" ]],
  ["50", "برج باجي مختار", "Bordj Badji Mokhtar", "Bordj Badji Mokhtar", 1500, "6-9", ["برج باجي مختار|Bordj Badji Mokhtar", "تيمياوين|Timiaouine" ]],
  ["51", "أولاد جلال", "Ouled Djellal", "Ouled Djellal", 900, "4-6", ["أولاد جلال|Ouled Djellal", "الدوسن|Doucen", "رأس الميعاد|Ras El Miaad", "سيدي خالد|Sidi Khaled", "الشعيبة|Chaïba" ]],
  ["52", "بني عباس", "Béni Abbès", "Béni Abbès", 1400, "5-8", ["بني عباس|Béni Abbès", "أولاد خضير|Ouled Khodeir", "تامترت|Tamtert", "إقلي|Igli", "كرزاز|Kerzaz" ]],
  ["53", "عين صالح", "In Salah", "In Salah", 1500, "6-9", ["عين صالح|In Salah", "فقارة الزوى|Foggaret Ezzoua", "عين قزام|In Guezzam" ]],
  ["54", "عين قزام", "In Guezzam", "In Guezzam", 1600, "7-10", ["عين قزام|In Guezzam", "تين زواتين|Tin Zaouatine" ]],
  ["55", "تقرت", "Touggourt", "Touggourt", 950, "4-7", ["تقرت|Touggourt", "تماسين|Témacine", "الزاوية العابدية|Zaouia El Abidia", "النزلة|Nezla", "الحجيرة|El Hadjira" ]],
  ["56", "جانت", "Djanet", "Djanet", 1600, "7-10", ["جانت|Djanet", "برج الحواس|Bordj El Haouas" ]],
  ["57", "المغير", "El M'Ghair", "El M'Ghair", 950, "4-7", ["المغير|El M'Ghair", "جامعة|Djamaa", "سيدي عمران|Sidi Amrane", "أم الطيور|Oum Touyour", "المرارة|Still" ]],
  ["58", "المنيعة", "El Meniaa", "El Meniaa", 1000, "4-7", ["المنيعة|El Meniaa", "حاسي القارة|Hassi Gara", "حاسي الفحل|Hassi Fehal" ]],
];

export const WILAYA_SEED: WilayaSeed[] = RAW.map(([code, nameAr, nameFr, nameEn, fee, eta, communes]) => ({
  code,
  nameAr,
  nameFr,
  nameEn,
  fee,
  eta,
  communes: communes.map((c) => {
    const [ar, fr] = c.split("|");
    return { nameAr: ar, nameFr: fr, nameEn: fr };
  }),
}));

export const FREE_SHIPPING_THRESHOLD = 9000;
