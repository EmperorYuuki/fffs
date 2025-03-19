const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors({ origin: 'http://127.0.0.1:8080' }));

const COOKIES_PATH = path.join(__dirname, 'chatgpt_cookies.json');
const LOG_FILE = path.join(__dirname, 'chatgpt.log');
const CHAPTER_CACHE = new Map();

let browser = null;
let isBrowserInitialized = false;

const PORT = process.env.PORT || 3003;
const CHROME_PATH = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function logToFile(message) {
  try {
    const stats = fs.existsSync(LOG_FILE) ? fs.statSync(LOG_FILE) : { size: 0 };
    if (stats.size > 10 * 1024 * 1024) {
      fs.renameSync(LOG_FILE, `${LOG_FILE}.${Date.now()}`);
    }
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} - ${message}\n`);
  } catch (error) {
    console.error('Error writing to log file:', error);
  }
}

function log(message) {
  console.log(message);
  logToFile(message);
}

function generateUniqueId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

async function createPage(browser) {
  const page = await browser.newPage();
  page.on('console', msg => log(`PAGE LOG: ${msg.text()}`));
  page.on('error', err => {
        log(`Page error: ${err}`);
  });
  page.on('pageerror', err => {
        log(`Page error: ${err}`);
  });
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.75 Safari/537.36");
  return page;
}

async function initializeBrowser(headless = false) {
  const headlessOption = headless === true
    ? parseInt(puppeteer.version?.split('.')[0]) >= 19
      ? { headless: 'new' }
      : { headless: true }
    : { headless: false };

  if (!isBrowserInitialized) {
    try {
      log('Launching browser...');
      browser = await puppeteer.launch({
        ...headlessOption,
        executablePath: CHROME_PATH,
        args: [
          "--disable-blink-features=AutomationControlled",
          "--disable-dev-shm-usage",
          "--no-sandbox",
          "--disable-setuid-sandbox"
        ]
      });
      isBrowserInitialized = true;
      log('Browser initialized successfully');

      const page = await createPage(browser);
      if (fs.existsSync(COOKIES_PATH)) {
        log('Cookies file found, loading cookies...');
        let cookies = JSON.parse(fs.readFileSync(COOKIES_PATH));
        cookies = cookies.filter(cookie => !cookie.expires || cookie.expires > Date.now() / 1000);
        if (cookies.length > 0) {
          await page.setCookie(...cookies);
          log('Valid cookies set on page');
        } else {
          log('Cookies file exists but no valid cookies found');
        }
      } else {
        log('No cookies file found; ready for manual login.');
      }
      await page.goto('https://chatgpt.com', { waitUntil: 'networkidle2', timeout: 60000 });
      log('Browser navigated to ChatGPT homepage');
      await page.close();

      browser.on('disconnected', () => {
        log('Browser disconnected, resetting instance...');
        browser = null;
        isBrowserInitialized = false;
      });
    } catch (error) {
      log(`Failed to initialize browser: ${error.message}`);
      throw error;
    }
  }
  return browser;
}

async function withBrowserRestart(operation, requestId, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      log(`Operation failed for request ${requestId}, attempt ${attempt + 1}/${maxRetries + 1}: ${error.message}`);
      if (attempt < maxRetries && (!browser || (browser.process && browser.process().killed))) {
        log('Browser appears disconnected, restarting...');
        browser = null;
        isBrowserInitialized = false;
        await initializeBrowser(false);
      } else {
        throw error;
      }
    }
  }
}

async function initiateManualLogin(requestId = generateUniqueId('request')) {
  let page;
  try {
    log(`Initiating manual login for request ${requestId}`);
    const b = await initializeBrowser(false);
    page = await createPage(b);
    await page.goto('https://chatgpt.com', { waitUntil: 'networkidle2', timeout: 60000 });
    log(`Please log in manually to ChatGPT at https://chatgpt.com for request ${requestId}`);
    await page.waitForFunction(() => {
      const profileButton = document.querySelector('[data-testid="profile-button"]') ||
            document.querySelector('.flex.h-10.rounded-lg.px-2.text-token-text-secondary[aria-label="Open Profile Menu"]');
      return profileButton !== null && profileButton.getAttribute('aria-expanded') === 'false';
    }, { timeout: 0 });
    const cookies = await page.cookies();
    fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
    log(`Cookies saved after manual login for request ${requestId}`);

    const projects = await scanProjects(page, requestId);
    await page.close();
    return { success: true, message: 'Manual login completed. Cookies saved and projects scanned.', projects };
  } catch (error) {
    log(`Manual login error for request ${requestId}: ${error.message}`);
    if (page && !page.isClosed()) await page.close();
    return { success: false, message: `Login failed: ${error.message}. Please try again or check your network.` };
  }
}

async function ensureLoggedIn(page, requestId) {
  try {
    log(`Ensuring user is logged in for request ${requestId}...`);
    const isLoggedIn = await page.evaluate(() => {
      const profileButton = document.querySelector('[data-testid="profile-button"]') ||
          document.querySelector('.flex.h-10.rounded-lg.px-2.text-token-text-secondary[aria-label="Open Profile Menu"]');
      return profileButton !== null && profileButton.getAttribute('aria-expanded') === 'false';
    });
    if (!isLoggedIn) {
      if (fs.existsSync(COOKIES_PATH)) {
        let cookies = JSON.parse(fs.readFileSync(COOKIES_PATH));
        cookies = cookies.filter(cookie => !cookie.expires || cookie.expires > Date.now() / 1000);
        await page.setCookie(...cookies);
        await page.goto('https://chatgpt.com', { waitUntil: 'networkidle2' });
        const loggedInAfterCookies = await page.evaluate(() => {
          const profileButton = document.querySelector('[data-testid="profile-button"]') ||
              document.querySelector('.flex.h-10.rounded-lg.px-2.text-token-text-secondary[aria-label="Open Profile Menu"]');
          return profileButton !== null && profileButton.getAttribute('aria-expanded') === 'false';
        });
        if (!loggedInAfterCookies) {
          log(`Cookies invalid for request ${requestId}. Initiating manual login...`);
          const loginResult = await initiateManualLogin(requestId);
          if (!loginResult.success) throw new Error(loginResult.message);
          cookies = JSON.parse(fs.readFileSync(COOKIES_PATH));
          await page.setCookie(...cookies);
        }
      } else {
        log(`No cookies found for request ${requestId}. Initiating manual login...`);
        const loginResult = await initiateManualLogin(requestId);
        if (!loginResult.success) throw new Error(loginResult.message);
        const newCookies = JSON.parse(fs.readFileSync(COOKIES_PATH));
        await page.setCookie(...newCookies);
      }
    }
    log(`User is now logged in for request ${requestId}`);
    return true;
  } catch (error) {
    log(`Error in ensureLoggedIn for request ${requestId}: ${error.message}`);
    throw new Error(`Login check failed: ${error.message}. Please verify ChatGPT login or network.`);
  }
}

async function fetchProjectInstructions(page, projectHref, requestId) {
  try {
    log(`Fetching instructions for project ${projectHref} for request ${requestId}`);
    await page.goto(`https://chatgpt.com${projectHref}`, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('button.group\\/snorlax-control-tile', { timeout: 30000 });

    const buttons = await page.$$('button.group\\/snorlax-control-tile');
    for (const button of buttons) {
      const text = await button.$eval('.text-sm.font-medium', el => el.innerText, { timeout: 5000 }).catch(() => '');
      if (text === 'Instructions') {
        await button.click();
        break;
      }
    }

    await page.waitForSelector('div[role="dialog"] textarea', { timeout: 30000 });
    const instructions = await page.evaluate(() => {
      const textarea = document.querySelector('div[role="dialog"] textarea');
      return textarea ? textarea.value.trim() : "";
    });
    log(`Instructions fetched for ${projectHref}: ${instructions.substring(0,100)}...`);
    return instructions;
  } catch (error) {
    log(`Error fetching instructions for ${projectHref}: ${error.message}`);
    return "";
  }
}

async function scanProjects(page, requestId) {
  try {
    log(`Scanning ChatGPT projects for request ${requestId}`);
    await page.waitForSelector('h2#snorlax-heading', { timeout: 30000 }).catch(() => {
      log('No projects heading found, might be using a different UI layout');
    });

    const projects = await page.evaluate(() => {
      const projectList = document.querySelector('ul[aria-labelledby="snorlax-heading"]');
      if (!projectList) {
        const allLinks = Array.from(document.querySelectorAll('a[href]'));
        const projectLinks = allLinks.filter(link =>
          link.href.includes('/project') &&
          (link.title || link.querySelector('.grow'))
        );
        return projectLinks.map(link => {
          const name = link.title || link.querySelector('.grow')?.innerText.trim() || "";
          const href = link.href.replace(window.location.origin, '');
          return { name, instructions: "", href };
        });
      }

      const projectLinks = Array.from(projectList.querySelectorAll('a[href$="/project"]'));
      return projectLinks.map(link => {
        const name = link.getAttribute('title') || link.querySelector('.grow')?.innerText.trim() || "";
        const href = link.getAttribute('href') || "";
        return { name, instructions: "", href };
      }).filter(p => p.name && p.href.endsWith('/project'));
    });

    for (let project of projects) {
      project.instructions = await fetchProjectInstructions(page, project.href, requestId);
    }

    log(`Found ${projects.length} projects with instructions for request ${requestId}`);
    return projects;
  } catch (error) {
    log(`Error scanning projects for request ${requestId}: ${error.message}`);
    return [];
  }
}

app.post('/update-instructions', async (req, res) => {
  const { projectHref, newInstructions } = req.body;
  const requestId = generateUniqueId('update');
  let page;
  try {
    log(`Updating instructions for project ${projectHref} to "${newInstructions.substring(0, 50)}..." for request ${requestId}`);
    const b = await initializeBrowser(false);
    page = await createPage(b);
    await ensureLoggedIn(page, requestId);

    await page.goto(`https://chatgpt.com${projectHref}`, { waitUntil: 'networkidle2', timeout: 60000 });

    await page.waitForSelector('button.group\\/snorlax-control-tile', { timeout: 30000 });
    const buttons = await page.$$('button.group\\/snorlax-control-tile');
    for (const button of buttons) {
      const text = await button.$eval('.text-sm.font-medium', el => el.innerText, { timeout: 5000 }).catch(() => '');
      if (text === 'Instructions') {
        await button.click();
        break;
      }
    }

    await page.waitForSelector('div[role="dialog"] textarea', { timeout: 30000 });
    await page.evaluate((instr) => {
      const ta = document.querySelector('div[role="dialog"] textarea');
      if (ta) {
        ta.value = instr;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, newInstructions);

    log('Textarea updated, waiting 3 seconds before further actions...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    await page.focus('div[role="dialog"] textarea');
    await page.keyboard.press('Enter');
    await new Promise(resolve => setTimeout(resolve, 2000));

    await page.screenshot({ path: 'before_save.png' });

    const saveButton = await page.waitForSelector('div[role="dialog"] button.btn-primary', { timeout: 30000 });
    await page.waitForFunction((btn) => {
      return btn && !btn.disabled && btn.offsetParent !== null;
    }, {}, saveButton);

    await saveButton.click({ delay: 500 });
    log('Save button clicked');

    await new Promise(resolve => setTimeout(resolve, 2000));
    await page.screenshot({ path: 'after_save.png' });

    await page.close();
    log(`Instructions updated successfully for ${projectHref}`);
    res.json({ success: true, message: 'Project instructions updated successfully.' });
  } catch (error) {
    log(`Update instructions failed for request ${requestId}: ${error.message}`);
    if (page && !page.isClosed()) await page.close();
    res.status(500).json({ success: false, message: `Update failed: ${error.message}. Please try again or check your network.` });
  }
});

async function fetchChapter(url, requestId) {
  if (CHAPTER_CACHE.has(url)) {
    log(`Fetching cached chapter for ${url}`);
    return CHAPTER_CACHE.get(url);
  }
  let page;
  try {
    log(`Fetching chapter from ${url} for request ${requestId}`);
    const b = await initializeBrowser(true);
    page = await createPage(b);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    log(`Page loaded for chapter URL ${url}`);

    const is69Yuedu = url.includes('69yuedu.net');
    const chapterData = await page.evaluate((is69Yuedu) => {
      if (is69Yuedu) {
        const contentDiv = document.querySelector('.content');
        const chapterName = document.querySelector('h1.hide720')?.innerText.trim() || '';
        const rawText = contentDiv ? contentDiv.innerText.trim() : '';
        const page1 = document.querySelector('.page1');
        const links = page1 ? Array.from(page1.querySelectorAll('a[href]')) : [];
        let prevLink = '';
        let nextLink = '';
        for (const link of links) {
          if (link.textContent.includes('上一章')) {
            prevLink = link.href;
          } else if (link.textContent.includes('下一章')) {
            nextLink = link.href;
          }
        }
        return { chapterName, rawText, prevLink, nextLink };
      } else {
        const chapterDetail = document.querySelector('.read_chapterDetail');
        const chapterName = document.querySelector('.read_chapterName h1')?.innerText.trim() || '';
        const prevLink = document.querySelector('.pageNav a[href*="tongren"][href*="html"]:nth-child(2)')?.href || '';
        const links = document.querySelectorAll('.pageNav a[href*="tongren"][href*="html"]');
        let nextLink = '';
        for (const link of links) {
          if (link.textContent.includes('下一章')) {
            nextLink = link.href;
            break;
          }
        }
        const rawText = chapterDetail ? chapterDetail.innerText.trim() : '';
        return { chapterName, rawText, prevLink, nextLink };
      }
    }, is69Yuedu);

    if (!chapterData.rawText) {
      throw new Error('No chapter text found on the page');
    }

    log(`Chapter fetched: ${chapterData.chapterName}, ${chapterData.rawText.substring(0, 100)}...`);
    await page.close();
    const result = { success: true, ...chapterData };
    CHAPTER_CACHE.set(url, result);
    return result;
  } catch (error) {
    log(`Error fetching chapter from ${url} for request ${requestId}: ${error.message}`);
    if (page && !page.isClosed()) await page.close();
    return { success: false, message: `Fetch failed: ${error.message}. Check the URL and try again.` };
  }
}

async function fetchMultipleChapters(url, count, requestId) {
  try {
    log(`Fetching ${count} chapters starting from ${url} for request ${requestId}`);
    let currentUrl = url;
    let combinedText = '';
    let lastChapterName = '';
    let lastNextLink = '';
    let lastPrevLink = url;

    for (let i = 0; i < count; i++) {
      const chapter = await fetchChapter(currentUrl, requestId);
      if (!chapter.success) {
        throw new Error(`Failed to fetch chapter ${i + 1}: ${chapter.message}`);
      }
      combinedText += (i > 0 ? '\n\n' : '') + chapter.rawText;
      lastChapterName = chapter.chapterName;
      lastNextLink = chapter.nextLink;
      if (i === 0) lastPrevLink = chapter.prevLink;
      if (!chapter.nextLink) {
        log(`No next chapter link found after ${i + 1} chapters`);
        break;
      }
      currentUrl = chapter.nextLink;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const result = {
      success: true,
      chapterName: lastChapterName,
      rawText: combinedText,
      prevLink: lastPrevLink,
      nextLink: lastNextLink
    };
    log(`Successfully fetched ${count} chapters for request ${requestId}`);
    return result;
  } catch (error) {
    log(`Error fetching multiple chapters for request ${requestId}: ${error.message}`);
    return { success: false, message: `Multi-chapter fetch failed: ${error.message}. Check the starting URL and count.` };
  }
}

app.post('/fetch-chapter', async (req, res) => {
  const { url, count = 1 } = req.body;
  const requestId = generateUniqueId('fetch');

  if (!url || !url.trim()) {
    return res.status(400).json({ success: false, message: 'No URL provided.' });
  }

  try {
    const result = count > 1
      ? await fetchMultipleChapters(url, parseInt(count), requestId)
      : await fetchChapter(url, requestId);
    if (!result || typeof result !== 'object') {
      return res.status(500).json({ success: false, message: 'Unexpected server error.' });
    }
    res.json(result);
  } catch (error) {
    console.error('fetch-chapter error:', error);
    res.status(500).json({ success: false, message: `Fetch failed: ${error.message}. Please try again.` });
  }
});

app.get('/clear-cache', async (req, res) => {
  CHAPTER_CACHE.clear();
  log('Chapter cache cleared');
  res.json({ success: true, message: 'Chapter cache cleared successfully.' });
});

function parseChunks(responseText) {
  log('Parsing input text for chunking based on chapter titles...');
  const chapterTitleRegex = /第\d+章\s.+/g;
  const matches = [...responseText.matchAll(chapterTitleRegex)];
  let chunks = [];

  if (matches.length === 0) {
    chunks.push(responseText.trim());
  } else {
    let lastIndex = 0;
    if (matches[0].index > 0) {
      let firstChunk = responseText.substring(0, matches[0].index).trim();
      if (firstChunk) chunks.push(firstChunk);
    }
    for (let i = 0; i < matches.length; i++) {
      let start = matches[i].index;
      let end = (i + 1 < matches.length) ? matches[i + 1].index : responseText.length;
      let chunk = responseText.substring(start, end).trim();
      if (chunk) {
        chunks.push(chunk);
      }
      lastIndex = end;
    }
    if (lastIndex < responseText.length) {
      let lastChunk = responseText.substring(lastIndex).trim();
      if (lastChunk) {
        chunks.push(lastChunk);
      }
    }
  }
  log(`Chunking complete: Created ${chunks.length} chunk(s) based on chapter titles.`);
  return chunks;
}

async function translateChunk(chunk, requestId, page, chatGPTUrl, promptPrefix = 'Follow the instructions carefully and first check the memory for the glossary. Ensure that all terms are correctly used and consistent. Maintain full sentences and paragraphs—do not cut them off mid-sentence or with dashes:', isRawText = false, retries = 3) {
    if (!page || page.isClosed()) {
        throw new Error('Browser page closed unexpectedly');
    }
    const startTime = Date.now();
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            if (!chunk || typeof chunk !== 'string' || !chunk.trim()) {
                throw new Error('Invalid or empty chunk provided for translation');
            }
            
            // Use raw text or add prompt prefix based on isRawText flag
            const prompt = isRawText ? chunk : `${promptPrefix} ${chunk}`;
            log(`Translating chunk for request ${requestId} with${isRawText ? 'out' : ''} prompt: ${prompt.substring(0, 50)}...`);

            await page.bringToFront();
            await page.waitForSelector('#prompt-textarea', { visible: true, timeout: 60000 });

            await page.evaluate(async (text) => {
              await navigator.clipboard.writeText(text);
            }, prompt);

            await page.focus("#prompt-textarea");
            await page.keyboard.down('Control');
            await page.keyboard.press('KeyV');
            await page.keyboard.up('Control');

            let sendButtonVisible = false;
            for (let attempt = 0; attempt < 25; attempt++) {
              try{
                await page.waitForFunction(() => {
                    const btn = document.querySelector('[data-testid="send-button"]');
                    if (!btn) return false;
                    const style = window.getComputedStyle(btn);
                    return style.display !== 'none' && style.visibility !== 'hidden' &&
                           !btn.classList.contains('disabled') && btn.getAttribute('aria-disabled') !== 'true';
                }, { timeout: 5000 });
                sendButtonVisible = true;
                break;
              } catch(e) {
                log(`Attempt ${attempt+1}/25 waiting for send button failed: ${e.message}`);
                await new Promise(r => setTimeout(r, 2000));
              }
            }

            if (!sendButtonVisible) {
                throw new Error('Send button not visible after multiple attempts');
            }

            await page.click('[data-testid="send-button"]', { delay: 500 });
            log(`Send button clicked for request ${requestId}`);

            await page.waitForFunction(() => {
                const stopBtn = document.querySelector('[data-testid="stop-button"]');
                const responseContainer = document.querySelector('article[data-testid^="conversation-turn-"]');
                return (!stopBtn || window.getComputedStyle(stopBtn).display === 'none') && responseContainer;
            }, { timeout: 600000 });

            log(`Translation completion detected for request ${requestId}`);

            await page.evaluate(() => {
                const lastTurn = document.querySelector('article[data-testid^="conversation-turn-"]:last-of-type');
                if (lastTurn) lastTurn.scrollIntoView();
            });
            await new Promise(resolve => setTimeout(resolve, 1000));


            const translation = await page.evaluate(() => {
                const lastTurn = document.querySelector('article[data-testid^="conversation-turn-"]:last-of-type');
                if (!lastTurn) return "";
                const message = lastTurn.querySelector('div[data-message-author-role="assistant"] .markdown');
                return message ? message.innerText.trim() : "";
            });

            if (!translation) {
              throw new Error('No translation response received from ChatGPT');
            }


            const duration = (Date.now() - startTime) / 1000;
            log(`Translation retrieved for request ${requestId}: ${translation.substring(0, 50)}... (took ${duration}s)`);

            await page.evaluate(() => {
                const editor = document.querySelector('#prompt-textarea');
                if (editor) {
                    if('value' in editor){
                        editor.value = '';
                    } else {
                        editor.innerHTML = '';
                    }
                    editor.dispatchEvent(new Event('input', { bubbles: true }));
                }
            });

            await new Promise(resolve => setTimeout(resolve, 1000));

            return translation;

        } catch (error) {
            log(`Translation attempt ${attempt} failed for request ${requestId}: ${error.message}`);
            if (attempt === retries) throw error;
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

app.post('/chunk-and-translate', async (req, res) => {
  const { 
    text, 
    chatGPTUrl, 
    promptPrefix = 'Follow the instructions carefully and first check the memory for the glossary. Ensure that all terms are correctly used and consistent. Maintain full sentences and paragraphs—do not cut them off mid-sentence or with dashes:',
    isRawText = false,
    noChunking = false
  } = req.body;
  
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'No text provided for translation.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const requestId = generateUniqueId('request');
  log(`Received translation request with isRawText: ${isRawText}, noChunking: ${noChunking}`);
  res.write(`event: start\ndata: ${JSON.stringify({ message: "Translation started", requestId })}\n\n`);
  
  try {
    // Only chunk the text if noChunking is false
    const chunks = noChunking ? [text] : parseChunks(text);
    const totalWords = text.split(/\s+/).length;
    let processedWords = 0;
    let page = await withBrowserRestart(async () => {
      const b = await initializeBrowser(false);
      const p = await createPage(b);

      const targetUrl = chatGPTUrl || 'https://chatgpt.com';
      await p.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });
      await ensureLoggedIn(p, requestId);
      return p;
    }, requestId);
    log(`Initialized new page for translation request ${requestId}`);

    let fullTranslation = "";
    for (let i = 0; i < chunks.length; i++) {
      log(`Processing chunk ${i + 1} of ${chunks.length} for request ${requestId}`);
      try {
        const chunkTranslation = await translateChunk(
          chunks[i], 
          requestId, 
          page, 
          chatGPTUrl, 
          promptPrefix,
          isRawText
        );
        
        fullTranslation += (i > 0 ? "\n\n" : "") + chunkTranslation;
        processedWords += chunks[i].split(/\s+/).length;
        const progress = Math.min((processedWords / totalWords) * 100, 100);

        res.write(`data: ${JSON.stringify({
          partial: fullTranslation,
          chunk: i + 1,
          total: chunks.length,
          progress
        })}\n\n`);
      } catch (error) {
        log(`Error translating chunk ${i + 1}: ${error.message}`);

        try {
          await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
          await ensureLoggedIn(page, requestId);

          await new Promise(resolve => setTimeout(resolve, 5000));
          const retryTranslation = await translateChunk(
            chunks[i], 
            requestId, 
            page, 
            chatGPTUrl, 
            promptPrefix,
            isRawText
          );
          
          fullTranslation += (i > 0 ? "\n\n" : "") + retryTranslation;
          processedWords += chunks[i].split(/\s+/).length;
          const progress = Math.min((processedWords / totalWords) * 100, 100);

          res.write(`data: ${JSON.stringify({
            partial: fullTranslation,
            chunk: i + 1,
            total: chunks.length,
            progress
          })}\n\n`);
        } catch (retryError) {
          log(`Retry for chunk ${i + 1} also failed: ${retryError.message}`);
          res.write(`event: error\ndata: ${JSON.stringify({
            error: `Error translating chunk ${i + 1}: ${retryError.message}. Continuing with next chunk.`,
            requestId
          })}\n\n`);

          fullTranslation += (i > 0 ? "\n\n" : "") +
            "--- TRANSLATION ERROR FOR THIS SECTION ---\n" +
            chunks[i].substring(0, 100) + "...\n" +
            "--- END OF ERROR SECTION ---";
        }
      }
    }

    if (page && !page.isClosed()) {
      await page.close();
    }

    res.write(`event: end\ndata: ${JSON.stringify({ translation: fullTranslation, requestId })}\n\n`);
    res.end();
  } catch (error) {
    log(`Error in /chunk-and-translate for request ${requestId}: ${error.message}`);
    res.write(`event: error\ndata: ${JSON.stringify({ error: error.message, requestId })}\n\n`);
    res.end();
  }
});

app.get('/verify-login', async (req, res) => {
  const requestId = req.query.requestId || generateUniqueId('request');
  let page;
  try {
    const b = await initializeBrowser(false);
    page = await createPage(b);
    await page.goto('https://chatgpt.com', { waitUntil: 'networkidle2', timeout: 60000 });
    const isLoggedIn = await page.evaluate(() => {
      const profileButton = document.querySelector('[data-testid="profile-button"]') ||
          document.querySelector('.flex.h-10.rounded-lg.px-2.text-token-text-secondary[aria-label="Open Profile Menu"]');
      return profileButton !== null && profileButton.getAttribute('aria-expanded') === 'false';
    });
    if (isLoggedIn) {
      log(`ChatGPT login verified successfully for request ${requestId}`);
      await page.close();
      res.json({ success: true, message: 'ChatGPT login verified with saved cookies.' });
    } else {
      log(`ChatGPT login verification failed for request ${requestId}`);
      await page.close();
      res.json({ success: false, message: 'ChatGPT login verification failed. Cookies may be invalid or expired. Please log in manually.' });
    }
  } catch (error) {
    log(`Verification error for request ${requestId}: ${error.message}`);
    if (page && !page.isClosed()) await page.close();
    res.json({ success: false, message: `Verification failed: ${error.message}. Please check ChatGPT login or network.` });
  }
});

app.get('/initiate-login', async (req, res) => {
  const requestId = req.query.requestId || generateUniqueId('request');
  const loginResult = await initiateManualLogin(requestId);
  res.json(loginResult);
});

app.listen(PORT, () => {
  log(`CHATGPT TRANSLATION SERVER RUNNING ON HTTP://LOCALHOST:${PORT}`);
  initializeBrowser(false).catch(error => log(`Failed to initialize browser on server start: ${error.message}`));
});

process.on('SIGTERM', async () => {
  log('SIGTERM received. Closing browser...');
  if (browser) {
    try {
      const pages = await browser.pages();
      await Promise.all(pages.map(page => page.close().catch(err => log(`Error closing page: ${err.message}`))));
      await browser.close();
      log('Browser closed on SIGTERM shutdown');
    } catch (error) {
      log(`Error during SIGTERM cleanup: ${error.message}`);
    }
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  log('SIGINT received. Closing browser...');
  if (browser) {
    try {
      const pages = await browser.pages();
      await Promise.all(pages.map(page => page.close().catch(err => log(`Error closing page: ${err.message}`))));
      await browser.close();
      log('Browser closed on SIGINT interrupt');
    } catch (error) {
      log(`Error during SIGINT cleanup: ${error.message}`);
    }
  }
  process.exit(0);
});