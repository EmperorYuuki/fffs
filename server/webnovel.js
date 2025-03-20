const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

puppeteer.use(StealthPlugin());

const app = express();
const PORT = 3000;
const COOKIE_FILE = path.join(__dirname, 'webnovel_cookies.json');
const SERIES_FILE = path.join(__dirname, 'webnovel_series.json');
const LOG_FILE = path.join(__dirname, 'webnovel.log');
const activeRequests = new Map();

// CORS configuration
const corsOptions = {
  origin: ['http://localhost:8080', 'http://127.0.0.1:8080'],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Origin']
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../frontend/public')));

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

        await gotoWithRetry(page, 'https://passport.webnovel.com/login.html?auto=1&target=iframe&maskOpacity=50&popup=1&format=redirect&appid=900&areaid=8&source=qidianoversea&returnurl=https%3A%2F%2Finkstone.webnovel.com%2Flogin%2Fcallback%3FredirectUrl%3Dhttps%253A%252F%252Finkstone.webnovel.com%2Fnovels%2Fdashboard', 3, requestId);
        log(`PLEASE LOG IN MANUALLY TO WEBNOVEL for request ${requestId}`);
        await pause(30000);

        if (!activeRequests.has(requestId)) {
            log(`Login cancelled by user for request ${requestId}. Closing browser...`);
            await browser.close();
            return res.status(400).json({ message: 'WEBNOVEL LOGIN ACTION CANCELLED BY USER.' });
        }

        const isLoggedIn = await evaluateWithTimeout(page, () => document.location.href.includes('inkstone.webnovel.com/novels/dashboard'), requestId);
        if (!isLoggedIn) {
            await browser.close();
            activeRequests.delete(requestId);
            return res.status(400).json({ message: 'WEBNOVEL LOGIN FAILED.' });
        }

        const cookies = await page.cookies();
        fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));

        // Navigate to the full novels list instead of dashboard
        await gotoWithRetry(page, 'https://inkstone.webnovel.com/novels/list?story=1', 3, requestId);
        await pause(3000);

        if (!activeRequests.has(requestId)) {
            log(`Series scraping cancelled by user for request ${requestId}. Closing browser...`);
            await browser.close();
            return res.status(400).json({ message: 'WEBNOVEL LOGIN ACTION CANCELLED BY USER.' });
        }

        // Scrape all series from the table
        const seriesData = await evaluateWithTimeout(page, () => {
            const rows = document.querySelectorAll('.ant-table-tbody tr');
            return Array.from(rows).map(row => {
                const seriesId = row.getAttribute('data-row-key');
                const nameElement = row.querySelector('a.link_btn--WIl9C.t_title_small') || row.querySelector('span._lock--oSDfq.t_title_small');
                const seriesName = nameElement?.textContent.trim();
                return seriesId && seriesName ? { id: seriesId, name: seriesName } : null;
            }).filter(Boolean);
        }, requestId);
        fs.writeFileSync(SERIES_FILE, JSON.stringify(seriesData, null, 2));
        log(`WEBNOVEL SERIES DATA SAVED for request ${requestId}: ${JSON.stringify(seriesData)}`);

        await browser.close();
        activeRequests.delete(requestId);
        res.json({ message: 'WEBNOVEL LOGIN SUCCESSFUL.' });
    } catch (error) {
        log(`Login error for request ${requestId}: ${error.message}`);
        if (activeRequests.has(requestId)) {
            const browser = activeRequests.get(requestId);
            log(`Closing browser due to error for request ${requestId}...`);
            await browser.close();
            activeRequests.delete(requestId);
        }
        if (error.message === 'Action cancelled by user.') {
            return res.status(400).json({ message: 'WEBNOVEL LOGIN ACTION CANCELLED BY USER.' });
        }
        return res.status(500).json({ message: `WEBNOVEL LOGIN ERROR: ${error.message}` });
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
            return res.status(400).json({ message: 'PLEASE LOG IN TO WEBNOVEL FIRST.' });
        }

        let seriesData = fs.existsSync(SERIES_FILE) ? JSON.parse(fs.readFileSync(SERIES_FILE, 'utf8')) : [];
        let seriesId = null;
        const normalizedFolderName = folderName.toLowerCase().replace(/[^\w\s:-]/g, '').trim();

        for (const series of seriesData) {
            const normalizedSeriesName = series.name.toLowerCase().replace(/[^\w\s:-]/g, '').trim();
            if (normalizedSeriesName === normalizedFolderName) {
                seriesId = series.id;
                log(`Exact match found for '${folderName}': ${series.name} (ID: ${seriesId})`);
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
                    log(`Fuzzy matched '${folderName}' to '${series.name}' (ID: ${seriesId})`);
                    break;
                }
            }
        }

        if (!seriesId) {
            await gotoWithRetry(page, 'https://inkstone.webnovel.com/novels/list?story=1', 3, requestId);
            await pause(3000);

            if (!activeRequests.has(requestId)) {
                log(`Series refresh cancelled by user for request ${requestId}. Closing browser...`);
                await browser.close();
                return res.status(400).json({ message: 'WEBNOVEL PUBLISH ACTION CANCELLED BY USER.' });
            }

            seriesData = await evaluateWithTimeout(page, () => {
                const rows = document.querySelectorAll('.ant-table-tbody tr');
                return Array.from(rows).map(row => {
                    const seriesId = row.getAttribute('data-row-key');
                    const nameElement = row.querySelector('a.link_btn--WIl9C.t_title_small') || row.querySelector('span._lock--oSDfq.t_title_small');
                    const seriesName = nameElement?.textContent.trim();
                    return seriesId && seriesName ? { id: seriesId, name: seriesName } : null;
                }).filter(Boolean);
            }, requestId);
            fs.writeFileSync(SERIES_FILE, JSON.stringify(seriesData, null, 2));
            log(`Refreshed series data for request ${requestId}: ${JSON.stringify(seriesData)}`);

            for (const series of seriesData) {
                const normalizedSeriesName = series.name.toLowerCase().replace(/[^\w\s:-]/g, '').trim();
                if (normalizedSeriesName === normalizedFolderName) {
                    seriesId = series.id;
                    log(`Exact match found after refresh for '${folderName}': ${series.name} (ID: ${seriesId})`);
                    break;
                }
                const seriesWords = normalizedSeriesName.split(' ').filter(w => w);
                const folderWords = normalizedFolderName.split(' ').filter(w => w);
                const matchingWords = folderWords.filter(w => seriesWords.includes(w)).length;
                if (matchingWords / folderWords.length >= 0.5) {
                    seriesId = series.id;
                    log(`Fuzzy matched after refresh '${folderName}' to '${series.name}' (ID: ${seriesId})`);
                    break;
                }
            }
        }

        if (!seriesId && seriesData.length > 0) {
            seriesId = seriesData[0].id;
            log(`No match for '${folderName}', using first series: ${seriesData[0].name} (ID: ${seriesId})`);
        }

        if (!seriesId) {
            await browser.close();
            activeRequests.delete(requestId);
            return res.status(400).json({ message: `NO SERIES MATCHING '${folderName}' FOUND.` });
        }

        await gotoWithRetry(page, `https://inkstone.webnovel.com/novels/chapter/create/${seriesId}`, 3, requestId);
        await pause(2000);

        if (!activeRequests.has(requestId)) {
            log(`Chapter creation navigation cancelled by user for request ${requestId}. Closing browser...`);
            await browser.close();
            return res.status(400).json({ message: 'WEBNOVEL PUBLISH ACTION CANCELLED BY USER.' });
        }

        await waitForSelectorWithTimeout(page, 'input[placeholder="Title Here"]', { timeout: 30000 }, 30000, requestId);
        await typeWithTimeout(page, 'input[placeholder="Title Here"]', title, {}, 30000, requestId);
        await pause(4000);

        if (!activeRequests.has(requestId)) {
            log(`Title input cancelled by user for request ${requestId}. Closing browser...`);
            await browser.close();
            return res.status(400).json({ message: 'WEBNOVEL PUBLISH ACTION CANCELLED BY USER.' });
        }

        // Log before evaluating in Node.js context
        log(`Setting TinyMCE content for request ${requestId}`);
        await evaluateWithTimeout(page, async (content) => {
            let attempts = 0;
            while (!window.tinymce && attempts < 20) {
                await new Promise(resolve => setTimeout(resolve, 500));
                attempts++;
            }
            const editor = window.tinymce?.get('mce_0') || window.tinymce?.activeEditor;
            if (editor) {
                editor.setContent(content, { format: 'html', no_events: false });
                editor.fire('change');
            } else {
                const contentBody = document.querySelector('.mce-content-body');
                if (contentBody) contentBody.innerHTML = content;
                else throw new Error('TinyMCE not found.');
            }
        }, content, requestId);
        await pause(1500);

        if (!activeRequests.has(requestId)) {
            log(`Content input cancelled by user for request ${requestId}. Closing browser...`);
            await browser.close();
            return res.status(400).json({ message: 'WEBNOVEL PUBLISH ACTION CANCELLED BY USER.' });
        }

        await waitForSelectorWithTimeout(page, 'button.ant-btn.ant-btn-primary.ant-btn-lg.ant-btn-background-ghost', { timeout: 30000 }, 30000, requestId);
        await clickWithTimeout(page, 'button.ant-btn.ant-btn-primary.ant-btn-lg.ant-btn-background-ghost', {}, 30000, requestId);
        await pause(2000);

        if (!activeRequests.has(requestId)) {
            log(`Publish step 1 cancelled by user for request ${requestId}. Closing browser...`);
            await browser.close();
            return res.status(400).json({ message: 'WEBNOVEL PUBLISH ACTION CANCELLED BY USER.' });
        }

        await waitForSelectorWithTimeout(page, 'button.ant-btn.ant-btn-primary.ant-btn-lg.ml16', { timeout: 30000 }, 30000, requestId);
        await clickWithTimeout(page, 'button.ant-btn.ant-btn-primary.ant-btn-lg.ml16', {}, 30000, requestId);
        await pause(5000);

        if (!activeRequests.has(requestId)) {
            log(`Publish step 2 cancelled by user for request ${requestId}. Closing browser...`);
            await browser.close();
            return res.status(400).json({ message: 'WEBNOVEL PUBLISH ACTION CANCELLED BY USER.' });
        }

        await waitForSelectorWithTimeout(page, '.ant-modal-content', { timeout: 15000 }, 15000, requestId);
        await pause(1500);

        if (!activeRequests.has(requestId)) {
            log(`Modal confirmation cancelled by user for request ${requestId}. Closing browser...`);
            await browser.close();
            return res.status(400).json({ message: 'WEBNOVEL PUBLISH ACTION CANCELLED BY USER.' });
        }

        await waitForSelectorWithTimeout(page, '.ant-modal-footer button.ant-btn.ant-btn-primary.ant-btn-lg', { timeout: 8000 }, 8000, requestId);
        await clickWithTimeout(page, '.ant-modal-footer button.ant-btn.ant-btn-primary.ant-btn-lg', {}, 8000, requestId);
        await pause(4000);

        if (!activeRequests.has(requestId)) {
            log(`Final publish confirmation cancelled by user for request ${requestId}. Closing browser...`);
            await browser.close();
            return res.status(400).json({ message: 'WEBNOVEL PUBLISH ACTION CANCELLED BY USER.' });
        }

        await browser.close();
        activeRequests.delete(requestId);
        res.json({ message: `CHAPTER "${title}" PUBLISHED TO WEBNOVEL SERIES ID ${seriesId}!` });
    } catch (error) {
        log(`Publish error for request ${requestId}: ${error.message}`);
        if (activeRequests.has(requestId)) {
            const browser = activeRequests.get(requestId);
            log(`Closing browser due to error for request ${requestId}...`);
            await browser.close();
            activeRequests.delete(requestId);
        }
        if (error.message === 'Action cancelled by user.') {
            return res.status(400).json({ message: 'WEBNOVEL PUBLISH ACTION CANCELLED BY USER.' });
        }
        res.status(500).json({ message: `WEBNOVEL PUBLISH ERROR: ${error.message}` });
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
    res.status(200).json({ message: `WEBNOVEL PROCESS TERMINATED FOR REQUEST ${requestId}.` });
});

app.get('/verify-cookie', async (req, res) => {
    const requestId = req.query.requestId;
    let browser = activeRequests.get(requestId);
    
    try {
        // If no browser exists, create one
        if (!browser) {
            browser = await launchBrowser();
            activeRequests.set(requestId, browser);
        }
        
        const page = await browser.newPage();
        
        // Set cookies from file if they exist
        if (fs.existsSync(COOKIE_FILE)) {
            const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf8'));
            await page.setCookie(...cookies);
        } else {
            await browser.close();
            activeRequests.delete(requestId);
            return res.json({ valid: false });
        }

        // Navigate to a page that requires login
        await gotoWithRetry(page, 'https://inkstone.webnovel.com/novels/dashboard', 3, requestId);
        
        // Check if we're still logged in
        const isLoggedIn = await evaluateWithTimeout(page, () => document.location.href.includes('inkstone.webnovel.com/novels/dashboard'), requestId);
        
        if (isLoggedIn) {
            // Get series data
            const seriesData = await evaluateWithTimeout(page, () => {
                const rows = document.querySelectorAll('.ant-table-tbody tr');
                return Array.from(rows).map(row => {
                    const seriesId = row.getAttribute('data-row-key');
                    const nameElement = row.querySelector('a.link_btn--WIl9C.t_title_small') || row.querySelector('span._lock--oSDfq.t_title_small');
                    const seriesName = nameElement?.textContent.trim();
                    return seriesId && seriesName ? { id: seriesId, name: seriesName } : null;
                }).filter(Boolean);
            }, requestId);
            
            await page.close();
            return res.json({ valid: true, series: seriesData });
        }
        
        await page.close();
        return res.json({ valid: false });
    } catch (error) {
        log(`Cookie verification error for request ${requestId}: ${error.message}`);
        if (browser) {
            await browser.close();
            activeRequests.delete(requestId);
        }
        return res.json({ valid: false });
    }
});

app.listen(PORT, () => {
    log(`WEBNOVEL SERVER RUNNING ON HTTP://LOCALHOST:${PORT}`);
});