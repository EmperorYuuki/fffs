const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

puppeteer.use(StealthPlugin());

const app = express();
const PORT = 3001;
const COOKIE_FILE = path.join(__dirname, 'scribblehub_cookies.json');
const SERIES_FILE = path.join(__dirname, 'scribblehub_series.json');
const LOG_FILE = path.join(__dirname, 'scribblehub.log');
const activeRequests = new Map();

// Enhanced CORS configuration
app.use(cors({
    origin: true, // Allow all origins (localhost variants)
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    credentials: true // If cookies or auth headers are needed
}));
app.use(express.json());

async function launchBrowser() {
    return await puppeteer.launch({
        headless: false,
        executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        args: ["--disable-blink-features=AutomationControlled"]
    });
}

function pause(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function logToFile(message) {
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} - ${message}\n`);
}

function log(message) {
    console.log(message);
    logToFile(message);
}

async function gotoWithRetry(page, url, retries = 3, requestId = null) {
    let dynamicTimeout = 60000;
    for (let i = 0; i < retries; i++) {
        try {
            const startTime = Date.now();
            log(`Navigating to ${url} (Attempt ${i + 1}/${retries}, Timeout ${dynamicTimeout}ms) for request ${requestId}`);
            await page.goto(url, { waitUntil: 'networkidle2', timeout: dynamicTimeout });
            const elapsed = Date.now() - startTime;
            dynamicTimeout = Math.min(120000, Math.max(60000, elapsed * 1.5));
            return;
        } catch (error) {
            log(`Navigation failed for request ${requestId}: ${error.message}`);
            if (i === retries - 1) throw error;
            await pause(2000 * (i + 1));
            if (!activeRequests.has(requestId)) {
                log(`Request ${requestId} cancelled. Browser closed during retry.`);
                throw new Error('Action cancelled by user.');
            }
        }
    }
}

async function waitForSelectorWithTimeout(page, selector, options = {}, timeout = 30000, requestId = null) {
    for (let i = 0; i < 3; i++) {
        try {
            log(`Waiting for selector '${selector}' (Attempt ${i + 1}/3) for request ${requestId}`);
            await page.waitForSelector(selector, { ...options, timeout });
            return true;
        } catch (error) {
            log(`Wait for selector '${selector}' failed for request ${requestId}: ${error.message}`);
            if (!activeRequests.has(requestId)) {
                log(`Request ${requestId} cancelled. Browser closed during wait.`);
                throw new Error('Action cancelled by user.');
            }
            if (i === 2 || !error.message.includes('waiting for selector')) throw error;
            await pause(2000 * (i + 1));
        }
    }
}

async function clickWithTimeout(page, selector, options = {}, timeout = 30000, requestId = null) {
    try {
        log(`Clicking '${selector}' for request ${requestId}`);
        await page.click(selector, { ...options, timeout });
    } catch (error) {
        log(`Click on '${selector}' failed for request ${requestId}: ${error.message}`);
        if (!activeRequests.has(requestId)) {
            log(`Request ${requestId} cancelled. Browser closed during click.`);
            throw new Error('Action cancelled by user.');
        }
        throw error;
    }
}

async function typeWithTimeout(page, selector, text, options = {}, timeout = 30000, requestId = null) {
    try {
        log(`Typing in '${selector}' for request ${requestId}`);
        await page.type(selector, text, { ...options, timeout });
    } catch (error) {
        log(`Typing in '${selector}' failed for request ${requestId}: ${error.message}`);
        if (!activeRequests.has(requestId)) {
            log(`Request ${requestId} cancelled. Browser closed during type.`);
            throw new Error('Action cancelled by user.');
        }
        throw error;
    }
}

async function evaluateWithTimeout(page, pageFunction, ...args) {
    const requestId = args[args.length - 1];
    try {
        log(`Evaluating for request ${requestId}`);
        return await page.evaluate(pageFunction, ...args.slice(0, -1));
    } catch (error) {
        log(`Evaluation failed for request ${requestId}: ${error.message}`);
        if (!activeRequests.has(requestId)) {
            log(`Request ${requestId} cancelled. Browser closed during evaluation.`);
            throw new Error('Action cancelled by user.');
        }
        throw error;
    }
}

function generateUniqueId(prefix = 'id') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

app.get('/login', async (req, res) => {
    const requestId = req.query.requestId || generateUniqueId('request');
    let browser;
    try {
        browser = await launchBrowser();
        activeRequests.set(requestId, browser);
        const page = await browser.newPage();

        await page.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.75 Safari/537.36");

        await gotoWithRetry(page, 'https://www.scribblehub.com/login/', 3, requestId);
        log(`PLEASE LOG IN MANUALLY TO SCRIBBLEHUB for request ${requestId}`);

        await waitForSelectorWithTimeout(page, '.menu_username_right.loggedin, a[href*="logout"]', { timeout: 90000 }, 90000, requestId);
        log(`Login detected for request ${requestId}, checking status...`);

        if (!activeRequests.has(requestId)) {
            log(`Login cancelled by user for request ${requestId}. Closing browser...`);
            await browser.close();
            return res.status(400).json({ message: 'SCRIBBLEHUB LOGIN ACTION CANCELLED BY USER.' });
        }

        const isLoggedIn = await evaluateWithTimeout(page, () => {
            const usernameElement = document.querySelector('.menu_username_right.loggedin');
            const logoutLink = document.querySelector('a[href*="logout"]');
            const dashboardUrl = window.location.href.includes('dashboard');
            log(`Username element found: ${!!usernameElement}, Logout link found: ${!!logoutLink}, Dashboard URL: ${dashboardUrl}`);
            return !!usernameElement || !!logoutLink || dashboardUrl;
        }, requestId);

        if (!isLoggedIn) {
            log(`Login check failed for request ${requestId} - selectors or URL not matched`);
            await browser.close();
            activeRequests.delete(requestId);
            return res.status(400).json({ message: 'SCRIBBLEHUB LOGIN FAILED OR NOT DETECTED. PLEASE TRY AGAIN.' });
        }

        log(`Login successful, saving cookies for request ${requestId}`);
        const cookies = await page.cookies();
        fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));
        log(`Cookies saved to ${COOKIE_FILE} for request ${requestId}`);

        await gotoWithRetry(page, 'https://www.scribblehub.com/dashboard/', 3, requestId);
        await waitForSelectorWithTimeout(page, '.search_main_box.dash', { timeout: 10000 }, 10000, requestId);
        await pause(3000);

        if (!activeRequests.has(requestId)) {
            log(`Series scraping cancelled by user for request ${requestId}. Closing browser...`);
            await browser.close();
            return res.status(400).json({ message: 'SCRIBBLEHUB LOGIN ACTION CANCELLED BY USER.' });
        }

        const seriesData = await evaluateWithTimeout(page, () => {
            const seriesElements = document.querySelectorAll('.search_main_box.dash');
            return Array.from(seriesElements).map(element => {
                const seriesName = element.querySelector('.search_title a')?.textContent.trim();
                const seriesIdMatch = element.className.match(/dash (\d+)/);
                return seriesIdMatch ? { id: seriesIdMatch[1], name: seriesName } : null;
            }).filter(Boolean);
        }, requestId);
        fs.writeFileSync(SERIES_FILE, JSON.stringify(seriesData, null, 2));
        log(`Series data saved for request ${requestId}: ${JSON.stringify(seriesData)}`);

        await browser.close();
        activeRequests.delete(requestId);
        res.json({ message: 'SCRIBBLEHUB LOGIN SUCCESSFUL.' });
    } catch (error) {
        log(`Login error for request ${requestId}: ${error.message}`);
        if (activeRequests.has(requestId)) {
            const browser = activeRequests.get(requestId);
            log(`Closing browser due to error for request ${requestId}...`);
            await browser.close();
            activeRequests.delete(requestId);
        }
        if (error.message === 'Action cancelled by user.') {
            return res.status(400).json({ message: 'SCRIBBLEHUB LOGIN ACTION CANCELLED BY USER.' });
        }
        return res.status(500).json({ message: `SCRIBBLEHUB LOGIN ERROR: ${error.message}` });
    }
});

app.post('/publish', async (req, res) => {
    const { title, content, tags = [], folderName, requestId } = req.body;
    if (!title || !content || !folderName || !requestId) {
        return res.status(400).json({ message: 'TITLE, CONTENT, FOLDER NAME, AND REQUEST ID REQUIRED.' });
    }

    let browser;
    try {
        browser = await launchBrowser();
        activeRequests.set(requestId, browser);
        const page = await browser.newPage();

        if (fs.existsSync(COOKIE_FILE)) {
            const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf8'));
            await page.setCookie(...cookies);
        } else {
            await browser.close();
            activeRequests.delete(requestId);
            return res.status(400).json({ message: 'PLEASE LOG IN TO SCRIBBLEHUB FIRST.' });
        }

        let seriesData = fs.existsSync(SERIES_FILE) ? JSON.parse(fs.readFileSync(SERIES_FILE, 'utf8')) : [];
        let seriesId = null;
        const normalizedFolderName = folderName.toLowerCase().replace(/[^\w\s:-]/g, '').trim();
        for (const series of seriesData) {
            const normalizedSeriesName = series.name.toLowerCase().replace(/[^\w\s:-]/g, '').trim();
            if (normalizedSeriesName === normalizedFolderName) {
                seriesId = series.id;
                break;
            }
        }
        if (!seriesId) {
            for (const series of seriesData) {
                const seriesWords = series.name.toLowerCase().replace(/[^\w\s:-]/g, '').split(' ').filter(w => w);
                const folderWords = normalizedFolderName.split(' ').filter(w => w);
                const matchingWords = folderWords.filter(w => seriesWords.includes(w)).length;
                if (matchingWords / folderWords.length >= 0.5) {
                    seriesId = series.id;
                    log(`Fuzzy matched '${folderName}' to '${series.name}'`);
                    break;
                }
            }
        }
        if (!seriesId) {
            await gotoWithRetry(page, 'https://www.scribblehub.com/dashboard/', 3, requestId);
            await pause(2000);

            if (!activeRequests.has(requestId)) {
                log(`Series matching cancelled by user for request ${requestId}. Closing browser...`);
                await browser.close();
                return res.status(400).json({ message: 'SCRIBBLEHUB PUBLISH ACTION CANCELLED BY USER.' });
            }

            seriesData = await evaluateWithTimeout(page, () => {
                const seriesElements = document.querySelectorAll('.search_main_box.dash');
                return Array.from(seriesElements).map(element => {
                    const seriesName = element.querySelector('.search_title a')?.textContent.trim();
                    const seriesIdMatch = element.className.match(/dash (\d+)/);
                    return seriesIdMatch ? { id: seriesIdMatch[1], name: seriesName } : null;
                }).filter(Boolean);
            }, requestId);
            fs.writeFileSync(SERIES_FILE, JSON.stringify(seriesData, null, 2));
            for (const series of seriesData) {
                const normalizedSeriesName = series.name.toLowerCase().replace(/[^\w\s:-]/g, '').trim();
                if (normalizedSeriesName === normalizedFolderName) {
                    seriesId = series.id;
                    break;
                }
                const seriesWords = normalizedSeriesName.split(' ').filter(w => w);
                const folderWords = normalizedFolderName.split(' ').filter(w => w);
                const matchingWords = folderWords.filter(w => seriesWords.includes(w)).length;
                if (matchingWords / folderWords.length >= 0.5) {
                    seriesId = series.id;
                    log(`Fuzzy matched '${folderName}' to '${series.name}'`);
                    break;
                }
            }
            if (!seriesId && seriesData.length > 0) {
                seriesId = seriesData[0].id;
                log(`No match for '${folderName}', using first series: ${seriesData[0].name}`);
            }
        }
        if (!seriesId) {
            await browser.close();
            activeRequests.delete(requestId);
            return res.status(400).json({ message: `NO SERIES MATCHING '${folderName}' FOUND.` });
        }

        await gotoWithRetry(page, `https://www.scribblehub.com/addchapter/${seriesId}/`, 3, requestId);
        await pause(2000);

        if (!activeRequests.has(requestId)) {
            log(`Chapter publishing cancelled by user for request ${requestId}. Closing browser...`);
            await browser.close();
            return res.status(400).json({ message: 'SCRIBBLEHUB PUBLISH ACTION CANCELLED BY USER.' });
        }

        await typeWithTimeout(page, 'input#chapter-title', title, {}, 30000, requestId);
        const frame = await page.frames().find(f => f.name() === 'edit_mycontent_chapter_ifr');
        if (!frame) throw new Error('TinyMCE iframe not found.');

        // Log outside the browser context
        log(`Setting TinyMCE content for request ${requestId}`);
        await frame.evaluate(async (content) => {
            let attempts = 0;
            while (!window.tinymce && attempts < 20) {
                await new Promise(resolve => setTimeout(resolve, 500));
                attempts++;
            }
            const editor = window.tinymce?.activeEditor;
            if (editor) editor.setContent(content, { format: 'html' });
            else {
                const contentBody = document.querySelector('.mce-content-body');
                if (contentBody) contentBody.innerHTML = content;
                else throw new Error('TinyMCE not found.');
            }
        }, content);
        await pause(1000);

        if (!activeRequests.has(requestId)) {
            log(`Post-content operations cancelled by user for request ${requestId}. Closing browser...`);
            await browser.close();
            return res.status(400).json({ message: 'SCRIBBLEHUB PUBLISH ACTION CANCELLED BY USER.' });
        }

        if (tags.length > 0) {
            await typeWithTimeout(page, 'input[name="tags"]', tags.join(',') + ',', {}, 30000, requestId);
            await pause(500);
        }
        await page.select('select#ac_post_status', 'draft');
        await clickWithTimeout(page, 'span#pub_chp_btn', {}, 30000, requestId);
        await pause(5000);

        if (!activeRequests.has(requestId)) {
            log(`Publication submission cancelled by user for request ${requestId}. Closing browser...`);
            await browser.close();
            return res.status(400).json({ message: 'SCRIBBLEHUB PUBLISH ACTION CANCELLED BY USER.' });
        }

        await browser.close();
        activeRequests.delete(requestId);
        res.json({ message: `CHAPTER "${title}" PUBLISHED TO SCRIBBLEHUB SERIES ID ${seriesId}.` });
    } catch (error) {
        log(`Publish error for request ${requestId}: ${error.message}`);
        if (activeRequests.has(requestId)) {
            const browser = activeRequests.get(requestId);
            log(`Closing browser due to error for request ${requestId}...`);
            await browser.close();
            activeRequests.delete(requestId);
        }
        if (error.message === 'Action cancelled by user.') {
            return res.status(400).json({ message: 'SCRIBBLEHUB PUBLISH ACTION CANCELLED BY USER.' });
        }
        res.status(500).json({ message: `SCRIBBLEHUB PUBLISH ERROR: ${error.message}` });
    }
});

app.post('/terminate', async (req, res) => {
    const { requestId } = req.body;
    if (!requestId) {
        return res.status(400).json({ message: 'REQUEST ID REQUIRED FOR TERMINATION.' });
    }

    log(`Termination request received for request ${requestId}`);
    if (activeRequests.has(requestId)) {
        const browser = activeRequests.get(requestId);
        try {
            log(`Forcibly closing browser for request ${requestId}`);
            await browser.close();
            activeRequests.delete(requestId);
            log(`Browser closed successfully for request ${requestId}`);
        } catch (error) {
            log(`Error closing browser for request ${requestId}: ${error.message}`);
            if (browser.process) {
                log(`Killing browser process for request ${requestId}`);
                browser.process.kill('SIGKILL');
            }
            activeRequests.delete(requestId);
        }
    } else {
        log(`No active browser found for request ${requestId}`);
    }
    res.status(200).json({ message: `SCRIBBLEHUB PROCESS TERMINATED FOR REQUEST ${requestId}.` });
});

app.listen(PORT, () => {
    log(`SCRIBBLEHUB SERVER RUNNING ON HTTP://LOCALHOST:${PORT}`);
});