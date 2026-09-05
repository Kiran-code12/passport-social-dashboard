const CATEGORIES = [
    "Application: applying for a new passport",
    "Renewal: renewing or reissuing an existing passport",
    "Appointments: passport appointment booking, rescheduling, or appointment slots",
    "Tatkal: urgent or expedited passport service",
    "Visa: visa applications, approvals, requirements, or visa-free travel",
    "Travel Issues: problems while travelling with a passport, border, immigration, or entry issues",
    "Government Announcements: official government policies, notices, schemes, rules, or announcements",
    "Scams/Fraud: passport scams, fake agents, fake websites, phishing, fraud, or cheating",
    "News: news reports or current events specifically about passports",
    "Personal Experiences: someone's personal passport story, experience, reaction, or anecdote"
];

const MAX_INPUT_CHARS = 512;

function normalizeText(text) {
    return (text || "")
        .replace(/\s+/g, " ")
        .trim();
}

function hasAny(text, patterns) {
    return patterns.some((pattern) => pattern.test(text));
}

/*
 * High-confidence rules.
 *
 * Rules are checked before the AI model.
 * The goal is to handle obvious categories deterministically
 * and use the AI model only for genuinely ambiguous content.
 */
function getRuleCategory(text) {
    const lower = text.toLowerCase();

    // --------------------------------------------------
    // 1. APPOINTMENTS
    // --------------------------------------------------

    if (
        hasAny(lower, [
            /\bpassport appointment\b/i,
            /\bappointment slot\b/i,
            /\bpassport slot\b/i,
            /\bpassport.*appointment\b/i,
            /\bappointment.*passport\b/i,
            /\breschedul.*appointment\b/i
        ])
    ) {
        return {
            category: "Appointments",
            score: 1,
            method: "domain_rule"
        };
    }

    // --------------------------------------------------
    // 2. RENEWAL
    //
    // IMPORTANT:
    // Renewal is checked BEFORE Tatkal.
    //
    // Example:
    // "Premium Fast Track Passport Renewals UK"
    // should be Renewal, not Tatkal.
    // --------------------------------------------------

    if (
        hasAny(lower, [
            /\bpassport renewal\b/i,
            /\bpassport renewals\b/i,
            /\brenew passport\b/i,
            /\brenewing passport\b/i,
            /\bpassport reissue\b/i,
            /\bpassport re-issue\b/i,
            /\breissue passport\b/i,
            /\bre-issue passport\b/i,
            /\bexpired passport\b/i,
            /\bpassport expired\b/i
        ])
    ) {
        return {
            category: "Renewal",
            score: 1,
            method: "domain_rule"
        };
    }

    // --------------------------------------------------
    // 3. TATKAL
    //
    // Only explicit Tatkal/urgent/expedited wording.
    // --------------------------------------------------

    if (
        hasAny(lower, [
            /\btatkal passport\b/i,
            /\btatkal\b/i,
            /\burgent passport\b/i,
            /\bexpedited passport\b/i
        ])
    ) {
        return {
            category: "Tatkal",
            score: 1,
            method: "domain_rule"
        };
    }

    // --------------------------------------------------
    // 4. SCAMS / FRAUD
    //
    // Only strong fraud indicators.
    // --------------------------------------------------

    if (
        hasAny(lower, [
            /\bpassport scam\b/i,
            /\bpassport fraud\b/i,
            /\bpassport scammer\b/i,
            /\bfake passport agent\b/i,
            /\bfake passport website\b/i,
            /\bfake passport site\b/i,
            /\bfake agent\b/i,
            /\bpassport phishing\b/i,
            /\bfraudulent passport\b/i
        ])
    ) {
        return {
            category: "Scams/Fraud",
            score: 1,
            method: "domain_rule"
        };
    }

    // --------------------------------------------------
    // 5. VISA
    // --------------------------------------------------

    if (
        hasAny(lower, [
            /\bvisa approved\b/i,
            /\bvisa approval\b/i,
            /\bvisa application\b/i,
            /\bvisa requirement\b/i,
            /\bvisa requirements\b/i,
            /\bvisa[- ]free\b/i,
            /\bvisa.*passport\b/i,
            /\bpassport.*visa\b/i,
            /\bpassport index\b/i,
            /\bpassport ranking\b/i,
            /\bpassport.*doors\b/i
        ])
    ) {
        return {
            category: "Visa",
            score: 1,
            method: "domain_rule"
        };
    }

    // --------------------------------------------------
    // 6. APPLICATION
    // --------------------------------------------------

    if (
        hasAny(lower, [
            /\bpassport application\b/i,
            /\bpassport apply\b/i,
            /\bapply for.*passport\b/i,
            /\bhow to apply.*passport\b/i,
            /\bnew passport\b/i,
            /\bpassport documents?\b/i,
            /\bpassport eligibility\b/i,
            /\bpassport requirements?\b/i,

            // Passport photo requirements/content
            /\bpassport photo\b/i,
            /\bpassport size photo\b/i,
            /\bpassport-size photo\b/i,

            // Hindi
            /पासपोर्ट फोटो/i,
            /पासपोर्ट साइज फोटो/i,
            /पासपोर्ट के लिए फोटो/i,

            // Bengali
            /পাসপোর্ট করার জন্য/i,
            /প্রয়োজনীয় কাগজপত্র/i,

            // Telugu
            /పాస్‌పోర్ట్/i
        ])
    ) {
        return {
            category: "Application",
            score: 1,
            method: "domain_rule"
        };
    }

    // --------------------------------------------------
    // 7. TRAVEL ISSUES
    // --------------------------------------------------

    if (
        hasAny(lower, [
            /\bpassport.*airport\b/i,
            /\bpassport.*border\b/i,
            /\bpassport.*immigration\b/i,
            /\bimmigration.*passport\b/i,
            /\bborder.*passport\b/i,
            /\bpassport.*denied\b/i,
            /\bpassport.*stopped\b/i,
            /\bstopped.*passport\b/i,
            /\bpassport.*entry\b/i,
            /\bentry.*passport\b/i
        ])
    ) {
        return {
            category: "Travel Issues",
            score: 1,
            method: "domain_rule"
        };
    }

    // --------------------------------------------------
    // 8. GOVERNMENT ANNOUNCEMENTS
    // --------------------------------------------------

    if (
        hasAny(lower, [
            /\bgovernment.*passport\b/i,
            /\bpassport.*government\b/i,
            /\bministry.*passport\b/i,
            /\bpassport.*ministry\b/i,
            /\bofficial.*passport\b/i,
            /\bpassport.*official\b/i,
            /\bnew passport rule\b/i,
            /\bpassport new rule\b/i,
            /\bpassport policy\b/i,
            /\bpassport rules\b/i,

            // Political/current government wording
            /\btrump.*passport\b/i,
            /\bpassport.*trump\b/i
        ])
    ) {
        return {
            category: "Government Announcements",
            score: 1,
            method: "domain_rule"
        };
    }

    // --------------------------------------------------
    // 9. NEWS
    //
    // Includes historical/current-event passport stories.
    // --------------------------------------------------

    if (
        hasAny(lower, [
            /\bpassport controversy\b/i,
            /\bpassport scandal\b/i,
            /\bpassport news\b/i,
            /\bpassport report\b/i,
            /\bpassport investigation\b/i,
            /\bpassport announcement\b/i,
            /\bpassport ban\b/i,
            /\bpassport costs\b/i,
            /\bpassport discovered\b/i,
            /\bpassport history\b/i,
            /\bfirst passport\b/i,
            /\bpassport index\b/i,
            /\bpassport ranking\b/i,

            // Common current-event wording
            /\bpassport.*controversy\b/i,
            /\bpassport.*investigation\b/i,
            /\bpassport.*political\b/i,

            // Thai current-event signals
            /สอบ.*TH-AI Passport/i,
            /TH-AI Passport.*สอบ/i,
            /พิรุธ/i,
            /ฮั้วประมูล/i
        ])
    ) {
        return {
            category: "News",
            score: 1,
            method: "domain_rule"
        };
    }

    // --------------------------------------------------
    // 10. PERSONAL EXPERIENCES
    // --------------------------------------------------

    if (
        hasAny(lower, [
            /\bmy passport\b/i,
            /\bi got my passport\b/i,
            /\bi received my passport\b/i,
            /\bmy passport experience\b/i,
            /\bpassport experience\b/i,
            /\bpassport memories\b/i,
            /\bpassport memory\b/i,
            /\bheart full of memories\b/i,
            /\bfull of stamps\b/i
        ])
    ) {
        return {
            category: "Personal Experiences",
            score: 1,
            method: "domain_rule"
        };
    }

    return null;
}


// --------------------------------------------------
// ZERO-SHOT AI FALLBACK
// --------------------------------------------------

let classifierPromise = null;

function getClassifier() {
    if (!classifierPromise) {
        classifierPromise = (async () => {
            const { pipeline } = await import("@xenova/transformers");

            console.log(
                "Loading zero-shot classification model (first run downloads it)..."
            );

            return pipeline(
                "zero-shot-classification",
                "Xenova/nli-deberta-v3-xsmall",
                {
                    progress_callback: (data) => {
                        if (data.status === "progress") {
                            console.log(
                                `  ${data.file}: ${Math.round(data.progress)}%`
                            );
                        } else {
                            console.log(
                                `  [${data.status}] ${data.file || ""}`
                            );
                        }
                    }
                }
            );
        })();
    }

    return classifierPromise;
}

function extractCategoryName(label) {
    const index = label.indexOf(":");

    if (index === -1) {
        return label;
    }

    return label.slice(0, index).trim();
}


// --------------------------------------------------
// MAIN CATEGORIZATION FUNCTION
// --------------------------------------------------

async function categorizeText(text) {
    const trimmed = normalizeText(text).slice(0, MAX_INPUT_CHARS);

    if (!trimmed) {
        return {
            category: null,
            score: 0,
            method: "none",
            allScores: {}
        };
    }

    // Step 1: deterministic rules
    const ruleResult = getRuleCategory(trimmed);

    if (ruleResult) {
        return {
            category: ruleResult.category,
            score: ruleResult.score,
            method: ruleResult.method,
            allScores: {}
        };
    }

    // Step 2: AI fallback
    const classifier = await getClassifier();

    const result = await classifier(trimmed, CATEGORIES, {
        multi_label: false
    });

    const allScores = {};

    result.labels.forEach((label, index) => {
        allScores[extractCategoryName(label)] = result.scores[index];
    });

    return {
        category: extractCategoryName(result.labels[0]),
        score: result.scores[0],
        method: "zero_shot",
        allScores
    };
}

module.exports = {
    categorizeText,
    CATEGORIES
};