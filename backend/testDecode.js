function decodeHtml(text) {
    if (!text) {
        return "";
    }

    let cleaned = String(text);

    cleaned = cleaned
        .replace(/\\u003C/gi, "<")
        .replace(/\\u003E/gi, ">")
        .replace(/\\u0026/gi, "&")
        .replace(/\\u0022/gi, '"')
        .replace(/\\u0027/gi, "'");

    cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, " ");

    cleaned = cleaned
        .replace(/<\/p>/gi, " ")
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<\/div>/gi, " ")
        .replace(/<\/li>/gi, " ")
        .replace(/<\/h[1-6]>/gi, " ");

    cleaned = cleaned.replace(/<[^>]*>/g, " ");

    cleaned = cleaned
        .replace(/&nbsp;/gi, " ")
        .replace(/&#32;/g, " ")
        .replace(/&#160;/g, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/gi, "'");

    cleaned = cleaned
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/\s+([,.!?;:])/g, "$1")
        .trim();

    return cleaned;
}

const input =
    '<!-- SC_OFF --><div class="md"><p>Hello <strong>passport</strong> world</p></div><!-- SC_ON --> &#32; submitted by /u/test';

console.log("Input:");
console.log(input);

console.log("\nCleaned:");
console.log(decodeHtml(input));