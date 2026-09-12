const regions = {
    India: [
        "india",
        "indian",
        "passport seva",
        "tatkal passport",
        "aadhaar",
        "aadhar",
        "delhi",
        "mumbai",
        "punjab",
        "jalandhar",
        "chandigarh"
    ],

    Pakistan: [
        "pakistan",
        "pakistani",
        "islamabad",
        "lahore",
        "karachi",
        "rawalpindi"
    ],

    Bangladesh: [
        "bangladesh",
        "bangladeshi",
        "dhaka",
        "chittagong"
    ],

    UnitedKingdom: [
        "uk",
        "united kingdom",
        "britain",
        "british",
        "london"
    ],

    UnitedStates: [
        "usa",
        "us",
        "united states",
        "america",
        "american",
        "new york",
        "california"
    ],

    Canada: [
        "canada",
        "canadian",
        "toronto",
        "vancouver"
    ],

    Australia: [
        "australia",
        "australian",
        "sydney",
        "melbourne"
    ],

    UAE: [
        "uae",
        "dubai",
        "abu dhabi",
        "united arab emirates"
    ]
};

function detectRegion(text) {
    const normalized = (text || "").toLowerCase();

    for (const [region, keywords] of Object.entries(regions)) {
        for (const keyword of keywords) {
            if (normalized.includes(keyword)) {
                return region;
            }
        }
    }

    return null;
}

module.exports = {
    detectRegion
};