/*
 * Display-only mapping for language codes.
 *
 * The backend detects languages with `franc`, which returns ISO 639-3
 * codes ("eng", "fra", "hnj"). Those codes remain the stored values and
 * the values sent to the API — this file only controls what the user
 * sees in the language filter.
 *
 * Any code missing from the map falls back to the code itself, so an
 * unmapped language can never break the dropdown.
 */

const LANGUAGE_NAMES = {
    // Widely used
    eng: "English",
    spa: "Spanish",
    fra: "French",
    deu: "German",
    ita: "Italian",
    por: "Portuguese",
    nld: "Dutch",
    rus: "Russian",
    ukr: "Ukrainian",
    pol: "Polish",
    ces: "Czech",
    slk: "Slovak",
    slv: "Slovenian",
    hrv: "Croatian",
    srp: "Serbian",
    bos: "Bosnian",
    mkd: "Macedonian",
    bul: "Bulgarian",
    ron: "Romanian",
    hun: "Hungarian",
    ell: "Greek",
    tur: "Turkish",
    swe: "Swedish",
    dan: "Danish",
    nob: "Norwegian Bokmål",
    nno: "Norwegian Nynorsk",
    nor: "Norwegian",
    fin: "Finnish",
    isl: "Icelandic",
    lit: "Lithuanian",
    lav: "Latvian",
    lvs: "Latvian",
    est: "Estonian",
    ekk: "Estonian",
    sqi: "Albanian",
    als: "Albanian",
    cat: "Catalan",
    eus: "Basque",
    glg: "Galician",
    gle: "Irish",
    cym: "Welsh",
    gla: "Scottish Gaelic",
    ltz: "Luxembourgish",
    afr: "Afrikaans",
    bel: "Belarusian",
    hye: "Armenian",
    kat: "Georgian",
    epo: "Esperanto",
    lat: "Latin",
    mlt: "Maltese",

    // Arabic, Hebrew, Persian and neighbours
    arb: "Arabic",
    ara: "Arabic",
    arz: "Egyptian Arabic",
    ary: "Moroccan Arabic",
    apc: "Levantine Arabic",
    acm: "Iraqi Arabic",
    heb: "Hebrew",
    pes: "Persian",
    fas: "Persian",
    prs: "Dari",
    kur: "Kurdish",
    ckb: "Central Kurdish",
    kmr: "Northern Kurdish",
    pbu: "Pashto",
    pus: "Pashto",
    tgk: "Tajik",
    azj: "Azerbaijani",
    aze: "Azerbaijani",
    uzn: "Uzbek",
    uzb: "Uzbek",
    kaz: "Kazakh",
    kir: "Kyrgyz",
    tuk: "Turkmen",
    tat: "Tatar",
    bak: "Bashkir",
    chv: "Chuvash",
    uig: "Uyghur",

    // South Asia
    hin: "Hindi",
    urd: "Urdu",
    ben: "Bengali",
    pan: "Punjabi",
    pnb: "Western Punjabi",
    guj: "Gujarati",
    mar: "Marathi",
    tam: "Tamil",
    tel: "Telugu",
    kan: "Kannada",
    mal: "Malayalam",
    ory: "Odia",
    ori: "Odia",
    asm: "Assamese",
    sin: "Sinhala",
    npi: "Nepali",
    nep: "Nepali",
    bho: "Bhojpuri",
    mai: "Maithili",
    mag: "Magahi",
    hne: "Chhattisgarhi",
    awa: "Awadhi",
    raj: "Rajasthani",
    hoc: "Ho",
    san: "Sanskrit",
    snd: "Sindhi",
    skr: "Saraiki",
    kas: "Kashmiri",
    div: "Dhivehi",
    bod: "Tibetan",
    dzo: "Dzongkha",

    // East and Southeast Asia
    cmn: "Chinese (Mandarin)",
    zho: "Chinese",
    yue: "Cantonese",
    wuu: "Wu Chinese",
    hak: "Hakka Chinese",
    nan: "Min Nan Chinese",
    jpn: "Japanese",
    kor: "Korean",
    vie: "Vietnamese",
    tha: "Thai",
    lao: "Lao",
    khm: "Khmer",
    mya: "Burmese",
    shn: "Shan",
    ind: "Indonesian",
    zlm: "Malay",
    msa: "Malay",
    jav: "Javanese",
    sun: "Sundanese",
    mad: "Madurese",
    min: "Minangkabau",
    bug: "Buginese",
    ban: "Balinese",
    bjn: "Banjar",
    ace: "Acehnese",
    tgl: "Tagalog",
    fil: "Filipino",
    ceb: "Cebuano",
    ilo: "Ilocano",
    hil: "Hiligaynon",
    bcl: "Central Bikol",
    war: "Waray",
    pam: "Kapampangan",
    pag: "Pangasinan",
    mrw: "Maranao",
    tsg: "Tausug",
    hnj: "Hmong Njua",
    hmn: "Hmong",
    mnp: "Min Bei Chinese",

   


    // Detector output for "could not determine"
    und: "Unknown"
};


export function getLanguageName(code) {
    if (!code) return "";

    const key = String(code).trim().toLowerCase();

    return LANGUAGE_NAMES[key] || String(code);
}

export default LANGUAGE_NAMES;