const REGION_RULES = [
    {
        region: "India",
        keywords: [
            "india",
            "indian",
            "bharat",
            "passport seva",
            "passport seva kendra",
            "psk",
            "rpo",
            "new delhi",
            "delhi",
            "mumbai",
            "bombay",
            "punjab",
            "jalandhar",
            "amritsar",
            "chandigarh",
            "ludhiana",
            "bangalore",
            "bengaluru",
            "hyderabad",
            "kolkata",
            "chennai",
            "ahmedabad",
            "pune"
        ]
    },

    {
        region: "UnitedStates",
        keywords: [
            "united states",
            "united states of america",
            "usa",
            "u.s.a",
            "u.s.",
            "us",
            "american",
            "america",
            "washington dc",
            "new york",
            "california",
            "texas",
            "florida"
        ]
    },

    {
        region: "UnitedKingdom",
        keywords: [
            "united kingdom",
            "great britain",
            "uk",
            "u.k.",
            "britain",
            "british",
            "england",
            "scotland",
            "wales",
            "northern ireland",
            "london",
            "manchester"
        ]
    },

    {
        region: "Canada",
        keywords: [
            "canada",
            "canadian",
            "toronto",
            "vancouver",
            "ontario",
            "montreal"
        ]
    },

    {
        region: "Australia",
        keywords: [
            "australia",
            "australian",
            "sydney",
            "melbourne",
            "brisbane",
            "perth",
            "canberra"
        ]
    },

    {
        region: "Russia",
        keywords: [
            "russia",
            "russian",
            "moscow",
            "st petersburg",
            "saint petersburg"
        ]
    },

    {
        region: "France",
        keywords: [
            "france",
            "french",
            "paris"
        ]
    },

    {
        region: "Germany",
        keywords: [
            "germany",
            "german",
            "berlin",
            "munich"
        ]
    },

    {
        region: "Spain",
        keywords: [
            "spain",
            "spanish",
            "madrid",
            "barcelona"
        ]
    },

    {
        region: "China",
        keywords: [
            "china",
            "chinese",
            "beijing",
            "shanghai",
            "hong kong"
        ]
    },

    {
        region: "Japan",
        keywords: [
            "japan",
            "japanese",
            "tokyo"
        ]
    },

    {
        region: "UnitedArabEmirates",
        keywords: [
            "united arab emirates",
            "uae",
            "u.a.e",
            "dubai",
            "abu dhabi"
        ]
    },

    {
        region: "Singapore",
        keywords: [
            "singapore",
            "singaporean"
        ]
    },

    {
        region: "NewZealand",
        keywords: [
            "new zealand",
            "new zealander",
            "auckland",
            "wellington"
        ]
    },

    {
        region: "Italy",
        keywords: [
            "italy",
            "italian",
            "rome",
            "milan"
        ]
    },

    {
        region: "Pakistan",
        keywords: [
            "pakistan",
            "pakistani",
            "islamabad",
            "karachi",
            "lahore"
        ]
    },

    {
        region: "Bangladesh",
        keywords: [
            "bangladesh",
            "bangladeshi",
            "dhaka"
        ]
    },

    {
        region: "Nepal",
        keywords: [
            "nepal",
            "nepali",
            "kathmandu"
        ]
    }
];


function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


function containsKeyword(text, keyword) {
    const escaped = escapeRegex(keyword);

    const pattern = new RegExp(
        `(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`,
        "iu"
    );

    return pattern.test(text);
}


function detectRegion(rawText) {
    if (!rawText) {
        return null;
    }

    const text = String(rawText)
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

    if (!text) {
        return null;
    }

    for (const rule of REGION_RULES) {
        for (const keyword of rule.keywords) {
            if (containsKeyword(text, keyword)) {
                return rule.region;
            }
        }
    }

    return null;
}


module.exports = {
    detectRegion
};