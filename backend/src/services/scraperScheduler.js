const path = require("path");
const { spawn } = require("child_process");

const SCRAPE_INTERVAL_MS = 20 * 60 * 1000;

let schedulerStarted = false;
let isRunning = false;

function runProcess(name, scriptPath) {
    return new Promise((resolve, reject) => {
        console.log(`[Scheduler] Starting ${name}...`);

        const child = spawn(process.execPath, [scriptPath], {
            cwd: path.resolve(__dirname, "../.."),
            env: process.env,
            stdio: "inherit"
        });

        child.on("error", (error) => {
            console.error(`[Scheduler] ${name} failed to start:`, error.message);
            reject(error);
        });

        child.on("close", (code) => {
            if (code === 0) {
                console.log(`[Scheduler] ${name} completed successfully.`);
                resolve();
            } else {
                const error = new Error(
                    `${name} exited with code ${code}`
                );

                console.error(`[Scheduler] ${name} failed.`);
                reject(error);
            }
        });
    });
}

async function runAllScrapers() {
    if (isRunning) {
        console.log("[Scheduler] A scraping cycle is already running.");
        return;
    }

    isRunning = true;

    console.log("\n========================================");
    console.log("[Scheduler] Starting automatic scraping");
    console.log("========================================\n");

    const youtubeScript = path.resolve(
        __dirname,
        "../scrapers/youtube/youtubeScraper.js"
    );

    const redditScript = path.resolve(
        __dirname,
        "../scrapers/reddit/redditScraper.js"
    );

    const blueskyScript = path.resolve(
        __dirname,
        "../scrapers/bluesky/blueskyScraper.js"
    );

    const clusteringScript = path.resolve(
        __dirname,
        "../../clusterPosts.js"
    );

    // ----------------------------------------
    // YouTube
    // ----------------------------------------

    try {
        await runProcess("YouTube scraper", youtubeScript);
    } catch (error) {
        console.error(
            "[Scheduler] YouTube scraper failed:",
            error.message
        );
    }

    // ----------------------------------------
    // Reddit
    // ----------------------------------------

    try {
        await runProcess("Reddit scraper", redditScript);
    } catch (error) {
        console.error(
            "[Scheduler] Reddit scraper failed:",
            error.message
        );
    }

    // ----------------------------------------
    // Bluesky
    // ----------------------------------------

    try {
        await runProcess("Bluesky scraper", blueskyScript);
    } catch (error) {
        console.error(
            "[Scheduler] Bluesky scraper failed:",
            error.message
        );
    }

    // ----------------------------------------
    // Clustering
    // ----------------------------------------

    try {
        await runProcess("Clustering", clusteringScript);
    } catch (error) {
        console.error(
            "[Scheduler] Clustering failed:",
            error.message
        );
    }

    console.log("\n========================================");
    console.log("[Scheduler] Scraping cycle finished");
    console.log("========================================\n");

    isRunning = false;
}

function startScraperScheduler() {
    if (schedulerStarted) {
        console.log("[Scheduler] Scheduler is already running.");
        return;
    }

    schedulerStarted = true;

    console.log(
        "[Scheduler] Automatic scraper scheduler started."
    );

    console.log(
        "[Scheduler] Scraping interval: every 20 minutes."
    );

    // Run once immediately when backend starts.
    runAllScrapers().catch((error) => {
        console.error(
            "[Scheduler] Initial scraping cycle failed:",
            error.message
        );

        isRunning = false;
    });

    // Continue automatically every 20 minutes.
    setInterval(() => {
        runAllScrapers().catch((error) => {
            console.error(
                "[Scheduler] Scheduled scraping cycle failed:",
                error.message
            );

            isRunning = false;
        });
    }, SCRAPE_INTERVAL_MS);
}

module.exports = {
    startScraperScheduler,
    runAllScrapers
};