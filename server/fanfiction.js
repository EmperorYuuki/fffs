const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

puppeteer.use(StealthPlugin());

const app = express();
const PORT = 3002;
const COOKIE_FILE = path.join(__dirname, 'fanfiction_cookies.json');
const DATA_FILE = path.join(__dirname, 'fanfiction_data.json');
const LOG_FILE = path.join(__dirname, 'fanfiction.log');
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
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-infobars", "--window-size=1920,1080", "--disable-blink-features=AutomationControlled"]
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
    let dynamicTimeout = 30000;
    for (let i = 0; i < retries; i++) {
        try {
            const startTime = Date.now();
            log(`Navigating to ${url} (Attempt ${i + 1}/${retries}, Timeout ${dynamicTimeout}ms) for request ${requestId}`);
            await page.goto(url, { waitUntil: 'networkidle2', timeout: dynamicTimeout });
            const elapsed = Date.now() - startTime;
            dynamicTimeout = Math.min(120000, Math.max(30000, elapsed * 1.5));
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
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.6943.127 Safari/537.36");
        await page.setViewport({ width: 1920, height: 1080 });

        await gotoWithRetry(page, 'https://www.fanfiction.net/login.php?cache=bust', 3, requestId);
        log(`PLEASE LOG IN MANUALLY TO FANFICTION.NET for request ${requestId}`);

        await waitForSelectorWithTimeout(page, 'span[onclick="location = \'/logout.php\';"]', { timeout: 60000 }, 60000, requestId);
        log(`Login detected for request ${requestId}, checking status...`);

        if (!activeRequests.has(requestId)) {
            log(`Login cancelled by user for request ${requestId}. Closing browser...`);
            await browser.close();
            return res.status(400).json({ message: 'FANFICTION.NET LOGIN ACTION CANCELLED BY USER.' });
        }

        const isLoggedIn = await evaluateWithTimeout(page, () => !!document.querySelector('span[onclick="location = \'/logout.php\';"]'), requestId);
        if (!isLoggedIn) {
            await browser.close();
            activeRequests.delete(requestId);
            return res.status(400).json({ message: 'FANFICTION.NET LOGIN FAILED.' });
        }

        const cookies = await page.cookies();
        fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));

        await gotoWithRetry(page, 'https://www.fanfiction.net/docs/docs.php', 3, requestId);
        await pause(5000);

        if (!activeRequests.has(requestId)) {
            log(`Document scraping cancelled by user for request ${requestId}. Closing browser...`);
            await browser.close();
            return res.status(400).json({ message: 'FANFICTION.NET LOGIN ACTION CANCELLED BY USER.' });
        }

        const docData = await evaluateWithTimeout(page, () => {
            const rows = document.querySelectorAll('table#gui_table1 tbody tr');
            return Array.from(rows).map(row => {
                const label = row.querySelector('td:nth-child(2) a')?.textContent.trim();
                const docIdMatch = row.querySelector('td:nth-child(5) a')?.href.match(/docid=(\d+)/);
                return label && docIdMatch ? { id: docIdMatch[1], name: label } : null;
            }).filter(Boolean);
        }, requestId);

        await gotoWithRetry(page, 'https://www.fanfiction.net/story/story_tab_list.php', 3, requestId);
        await pause(5000);

        if (!activeRequests.has(requestId)) {
            log(`Story scraping cancelled by user for request ${requestId}. Closing browser...`);
            await browser.close();
            return res.status(400).json({ message: 'FANFICTION.NET LOGIN ACTION CANCELLED BY USER.' });
        }

        const storyData = await evaluateWithTimeout(page, () => {
            const stories = document.querySelectorAll('div.sort-list div.z-list');
            return Array.from(stories).map(story => {
                const titleElement = story.querySelector('.l-title');
                const storyIdMatch = titleElement?.id.match(/s(\d+)/);
                return titleElement && storyIdMatch ? { id: storyIdMatch[1], name: titleElement.textContent.trim() } : null;
            }).filter(Boolean);
        }, requestId);

        const combinedData = { documents: docData, stories: storyData };
        fs.writeFileSync(DATA_FILE, JSON.stringify(combinedData, null, 2));
        await browser.close();
        activeRequests.delete(requestId);
        res.json({ message: 'FANFICTION.NET LOGIN SUCCESSFUL.' });
    } catch (error) {
        log(`Login error for request ${requestId}: ${error.message}`);
        if (activeRequests.has(requestId)) {
            const browser = activeRequests.get(requestId);
            log(`Closing browser due to error for request ${requestId}...`);
            await browser.close();
            activeRequests.delete(requestId);
        }
        if (error.message === 'Action cancelled by user.') {
            return res.status(400).json({ message: 'FANFICTION.NET LOGIN ACTION CANCELLED BY USER.' });
        }
        return res.status(500).json({ message: `FANFICTION.NET LOGIN ERROR: ${error.message}` });
    }
});

app.post('/publish', async (req, res) => {
    const { title, content, folderName, requestId } = req.body;
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
            return res.status(400).json({ message: 'PLEASE LOG IN TO FANFICTION.NET FIRST.' });
        }

        let fanfictionData = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : { documents: [], stories: [] };
        await gotoWithRetry(page, 'https://www.fanfiction.net/docs/docs.php', 3, requestId);
        await pause(5000);

        if (!activeRequests.has(requestId)) {
            log(`Document upload cancelled by user for request ${requestId}. Closing browser...`);
            await browser.close();
            return res.status(400).json({ message: 'FANFICTION.NET PUBLISH ACTION CANCELLED BY USER.' });
        }

        await typeWithTimeout(page, 'input[name="title"]', title, {}, 30000, requestId);
        await evaluateWithTimeout(page, () => {
            const fileUpload = document.querySelector('input[name="method"][value="file"]');
            const copyPaste = document.querySelector('input[name="method"][value="web"]');
            if (fileUpload && copyPaste) {
                fileUpload.checked = false;
                copyPaste.checked = true;
                copyPaste.dispatchEvent(new Event('click'));
            }
        }, requestId);
        await pause(2000);

        if (!activeRequests.has(requestId)) {
            log(`Content upload cancelled by user for request ${requestId}. Closing browser...`);
            await browser.close();
            return res.status(400).json({ message: 'FANFICTION.NET PUBLISH ACTION CANCELLED BY USER.' });
        }

        const frame = await page.frames().find(f => f.name() === 'webcontent_ifr');
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
        await pause(2000);

        if (!activeRequests.has(requestId)) {
            log(`Post-content operations cancelled by user for request ${requestId}. Closing browser...`);
            await browser.close();
            return res.status(400).json({ message: 'FANFICTION.NET PUBLISH ACTION CANCELLED BY USER.' });
        }

        await clickWithTimeout(page, 'input[name="format"][value="0"]', {}, 30000, requestId);
        await clickWithTimeout(page, 'button[type="submit"]', {}, 30000, requestId);
        await pause(10000);

        if (!activeRequests.has(requestId)) {
            log(`Submission cancelled by user for request ${requestId}. Closing browser...`);
            await browser.close();
            return res.status(400).json({ message: 'FANFICTION.NET PUBLISH ACTION CANCELLED BY USER.' });
        }

        let newDoc = null;
        for (let attempt = 0; attempt < 3; attempt++) {
            newDoc = await evaluateWithTimeout(page, title => {
                const rows = document.querySelectorAll('table#gui_table1 tbody tr');
                for (let row of rows) {
                    const label = row.querySelector('td:nth-child(2) a')?.textContent.trim();
                    const docIdMatch = row.querySelector('td:nth-child(5) a')?.href.match(/docid=(\d+)/);
                    if (label === title && docIdMatch) return { id: docIdMatch[1], name: label };
                }
                return null;
            }, title, requestId);
            if (newDoc) break;
            await pause(2000);

            if (!activeRequests.has(requestId)) {
                log(`Document retrieval cancelled by user for request ${requestId}. Closing browser...`);
                await browser.close();
                return res.status(400).json({ message: 'FANFICTION.NET PUBLISH ACTION CANCELLED BY USER.' });
            }
        }

        if (!newDoc) {
            await browser.close();
            activeRequests.delete(requestId);
            return res.status(500).json({ message: 'FAILED TO RETRIEVE NEW DOCUMENT ID.' });
        }

        fanfictionData.documents.push(newDoc);
        fs.writeFileSync(DATA_FILE, JSON.stringify(fanfictionData, null, 2));

        let storyId = null;
        const normalizedFolderName = folderName.toLowerCase().replace(/[^\w\s:-]/g, '').trim();
        for (const story of fanfictionData.stories) {
            const normalizedStoryName = story.name.toLowerCase().replace(/[^\w\s:-]/g, '').trim();
            if (normalizedStoryName === normalizedFolderName) {
                storyId = story.id;
                break;
            }
            const storyWords = normalizedStoryName.split(' ').filter(w => w);
            const folderWords = normalizedFolderName.split(' ').filter(w => w);
            const matchingWords = folderWords.filter(w => storyWords.includes(w)).length;
            if (matchingWords / folderWords.length >= 0.5) {
                storyId = story.id;
                log(`Fuzzy matched '${folderName}' to '${story.name}'`);
                break;
            }
        }
        if (!storyId && fanfictionData.stories.length > 0) {
            storyId = fanfictionData.stories[0].id;
            log(`No match for '${folderName}', using first story: ${fanfictionData.stories[0].name}`);
        }

        if (!storyId) {
            await browser.close();
            activeRequests.delete(requestId);
            return res.json({ message: `CHAPTER "${title}" UPLOADED AS '${title}'. LINK TO STORY MANUALLY USING DOCUMENT ID ${newDoc.id}.` });
        }

        await gotoWithRetry(page, `https://www.fanfiction.net/story/story_edit_content.php?storyid=${storyId}#`, 3, requestId);
        await pause(5000);

        if (!activeRequests.has(requestId)) {
            log(`Story linking cancelled by user for request ${requestId}. Closing browser...`);
            await browser.close();
            return res.status(400).json({ message: 'FANFICTION.NET PUBLISH ACTION CANCELLED BY USER.' });
        }

        await evaluateWithTimeout(page, () => document.querySelector('a[onclick="$(\'#area_newchapter\').show();$(\'#area_modchapter\').hide();return false;"]').click(), requestId);
        await pause(2000);
        await typeWithTimeout(page, '#newchapter input[name="chaptertitle"]', title, {}, 30000, requestId);
        await page.select('#newchapter select[name="docid"]', newDoc.id);
        await clickWithTimeout(page, '#newchapter button[type="submit"]', {}, 30000, requestId);
        await pause(10000);

        if (!activeRequests.has(requestId)) {
            log(`Chapter submission cancelled by user for request ${requestId}. Closing browser...`);
            await browser.close();
            return res.status(400).json({ message: 'FANFICTION.NET PUBLISH ACTION CANCELLED BY USER.' });
        }

        await browser.close();
        activeRequests.delete(requestId);
        res.json({ message: `CHAPTER "${title}" PUBLISHED TO FANFICTION.NET STORY ID ${storyId}.` });
    } catch (error) {
        log(`Publish error for request ${requestId}: ${error.message}`);
        if (activeRequests.has(requestId)) {
            const browser = activeRequests.get(requestId);
            log(`Closing browser due to error for request ${requestId}...`);
            await browser.close();
            activeRequests.delete(requestId);
        }
        if (error.message === 'Action cancelled by user.') {
            return res.status(400).json({ message: 'FANFICTION.NET PUBLISH ACTION CANCELLED BY USER.' });
        }
        res.status(500).json({ message: `FANFICTION.NET PUBLISH ERROR: ${error.message}` });
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
    res.status(200).json({ message: `FANFICTION.NET PROCESS TERMINATED FOR REQUEST ${requestId}.` });
});

app.listen(PORT, () => {
    log(`FANFICTION.NET SERVER RUNNING ON HTTP://LOCALHOST:${PORT}`);
});