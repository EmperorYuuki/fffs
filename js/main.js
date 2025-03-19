/**
 * Main Application Script for QuillSync AI
 * This file initializes all modules and handles application startup
 * Fixed imports to use the correct paths for core and service modules
 */

// Import core services
import UIService from './core/UIService.js';
import TextService from './core/TextService.js';
import StorageService from './core/StorageService.js';

// Import application services with proper paths
import ProjectService from './services/ProjectService.js';
import GlossaryService from './services/GlossaryService.js';
import OpenRouterService from './services/OpenRouterService.js';
import ChatGPTService from './services/ChatGPTService.js';
import ChapterFetcherService from './services/ChapterFetcherService.js';
import DraftService from './services/DraftService.js';
import PublishingService from './services/PublishingService.js';

/**
 * Main application initialization function
 * Uses async/await to manage initialization sequence with proper dependency injection
 */
async function initializeApplication() {
  try {
    console.log('QuillSync AI initializing...');
    
    // Show loading overlay during initialization
    UIService.toggleLoading(true, 'Initializing QuillSync AI...');
    
    // Step 1: Initialize core services first
    console.log('Initializing core services...');
    await StorageService.initialize();
    await UIService.initialize();
    
    // Step 2: Initialize project service with dependencies
    console.log('Initializing project service...');
    await ProjectService.initialize();
    
    // Step 3: Initialize API services with dependencies
    console.log('Initializing OpenRouter service...');
    await OpenRouterService.initialize();
    
    // Step 4: Initialize services that depend on other services
    console.log('Initializing glossary service...');
    await GlossaryService.initialize();
    
    console.log('Initializing ChatGPT service...');
    await ChatGPTService.initialize();
    
    console.log('Initializing chapter fetcher service...');
    await ChapterFetcherService.initialize();
    
    console.log('Initializing draft service...');
    await DraftService.initialize();
    
    // Initialize publishing service
    console.log('Initializing publishing service...');
    await PublishingService.initialize();
    
    // Step 5: Set up UI components
    console.log('Setting up UI components...');
    // Initialize Quill editor
    const quill = initializeQuill();
    
    // Initialize all UI event handlers
    initializeEventHandlers();
    
    // Hide loading overlay
    UIService.toggleLoading(false);
    
    // Update status
    UIService.updateLastAction('Application initialized');
    UIService.showNotification('QuillSync AI initialized successfully', 'success');
    
    console.log('QuillSync AI initialized successfully');
  } catch (error) {
    console.error('Error initializing QuillSync AI:', error);
    
    try {
      // Attempt to show error notification if UI service is initialized
      UIService.toggleLoading(false);
      UIService.showNotification(
        `Error initializing application: ${error.message}. Some features may not work properly. ` +
        'Please refresh the page or check the console for details.',
        'error',
        10000
      );
    } catch (uiError) {
      // Fallback if UI service failed to initialize
      console.error('UI service not available for error notification:', uiError);
      alert(`Failed to initialize application: ${error.message}. Please refresh the page.`);
    }
  }
}

/**
 * Initialize Quill editor instance
 * @returns {Quill|null} - The Quill editor instance or null if unavailable
 */
function initializeQuill() {
  if (!window.Quill) {
    console.warn('Quill library not available');
    return null;
  }
  
  try {
    const quillContainer = document.getElementById('translation-output');
    if (!quillContainer) {
      console.error('Quill container not found');
      return null;
    }
    
    const quill = new window.Quill('#translation-output', {
      theme: 'bubble',
      modules: {
        toolbar: false,
        history: {
          delay: 1000,
          maxStack: 100,
          userOnly: true
        }
      },
    });
    
    // Register quill with UI service for word counts
    UIService.registerQuill(quill);
    
    // Update word counts initially
    UIService.updateWordCounts();
    
    return quill;
  } catch (error) {
    console.error('Failed to initialize Quill editor:', error);
    return null;
  }
}
/**
 * Initialize prompt toggle with localStorage persistence
 */
function initializePromptToggle() {
  const promptToggle = document.getElementById('include-prompt-toggle');
  if (promptToggle) {
    // Load saved state from localStorage
    const savedState = localStorage.getItem('includePrompt');
    if (savedState !== null) {
      promptToggle.checked = savedState === 'true';
    } else {
      // Default to true and save the default
      promptToggle.checked = true;
      localStorage.setItem('includePrompt', 'true');
    }
    
    // Add change listener
    promptToggle.addEventListener('change', function() {
      localStorage.setItem('includePrompt', this.checked.toString());
      UIService.updateLastAction('Prompt inclusion ' + (this.checked ? 'enabled' : 'disabled'));
    });
  }
}
/**
 * Initialize all event handlers for the application
 */
function initializeEventHandlers() {
  // Set up translation controls
  initializeTranslationControls();
  
  // Set up keyboard shortcuts
  setupKeyboardShortcuts();
  
  // Set up glossary toggle
  initializeGlossaryToggle();
  
  // Set up prompt toggle
  initializePromptToggle();
  
  // Set up export functionality
  initializeExportFunctionality();
  
  // Set up tab navigation
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabId = button.dataset.tab;
      UIService.activateTab(tabId);
    });
  });
  
  // Initialize publishing controls
  initializePublishingControls();
  
  // Initialize any remaining UI components
  UIService.initializeModals();
}

/**
 * Initialize translation-specific UI elements and handlers
 */
function initializeTranslationControls() {
  // Setup translate button
  const translateBtn = document.getElementById('translate-btn');
  if (translateBtn) {
    translateBtn.addEventListener('click', function() {
      const translationMethod = document.getElementById('translation-method');
      if (translationMethod) {
        if (translationMethod.value === 'openrouter') {
          OpenRouterService.translateText(true);
        } else if (translationMethod.value === 'chatgpt') {
          // Get the input text and pass it to the ChatGPT service
          const inputText = document.getElementById('input-text')?.value?.trim();
          ChatGPTService.translateText(inputText);
        }
      }
    });
  }
  
  // Setup refine button
  const refineBtn = document.getElementById('refine-btn');
  if (refineBtn) {
    refineBtn.style.display = ''; // Show the button now that it's implemented
    refineBtn.addEventListener('click', () => {
      ChatGPTService.handleRefineButtonClick();
    });
  }
  
  // Initialize preview button
  const previewBtn = document.getElementById('preview-btn');
  if (previewBtn) {
    previewBtn.addEventListener('click', () => {
      ChatGPTService.handlePreviewButtonClick();
    });
  }
  
  // Initialize verify button
  const verifyBtn = document.getElementById('verify-btn');
  if (verifyBtn) {
    verifyBtn.addEventListener('click', () => {
      // Dynamically determine which service to use based on project settings
      const currentProject = ProjectService.getCurrentProject();
      if (currentProject?.settings?.translationMethod === 'openrouter') {
        OpenRouterService.handleVerifyButtonClick();
      } else {
        // For ChatGPT or if no method specified
        const inputText = document.getElementById('input-text')?.value?.trim();
        const quill = UIService.getQuill();
        const translatedText = quill?.getText().trim();
        
        if (inputText && translatedText) {
          ChatGPTService.verifyTranslation(inputText, translatedText);
        } else {
          UIService.showNotification('Source and translated text are required for verification', 'warning');
        }
      }
    });
  }
}

/**
 * Initialize glossary toggle with localStorage persistence
 */
function initializeGlossaryToggle() {
  const glossaryToggle = document.getElementById('apply-glossary-toggle');
  if (glossaryToggle) {
    // Load saved state from localStorage
    const savedState = localStorage.getItem('applyGlossary');
    if (savedState !== null) {
      glossaryToggle.checked = savedState === 'true';
    } else {
      // Default to true and save the default
      glossaryToggle.checked = true;
      localStorage.setItem('applyGlossary', 'true');
    }
    
    // Add change listener
    glossaryToggle.addEventListener('change', function() {
      localStorage.setItem('applyGlossary', this.checked.toString());
    });
  }
}

/**
 * Initialize export functionality
 */
function initializeExportFunctionality() {
  const exportBtn = document.getElementById('export-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      const quill = UIService.getQuill();
      if (!quill) return;
      
      const text = quill.getText();
      if (!text.trim()) {
        UIService.showNotification('No content to export', 'warning');
        return;
      }
      
      const formatSelect = document.getElementById('export-format');
      const format = formatSelect ? formatSelect.value : 'txt';

      if (format === 'draft') {
        // Import DraftService dynamically to avoid circular dependencies
        const module = await import('./services/DraftService.js');
        const DraftService = module.default;
        
        // Prompt for draft title
        const title = prompt('Enter a title for your draft:', '');
        if (!title) {
          UIService.showNotification('Draft creation cancelled', 'info');
          return;
        }
        
        // Create a new draft with the user-provided title
        const draft = await DraftService.createDraft(title);
        
        // Set content
        draft.content = JSON.stringify(quill.getContents());
        
        // Update word count
        draft.wordCount = TextService.countWords(text);
        
        // Save changes
        await StorageService.saveItem('drafts', draft);
        
        // Set as current draft
        await DraftService.setCurrentDraft(draft.id);
        
        // Switch to editor tab
        UIService.activateSecondaryTab('drafts-editor');
        
        // Switch to drafts tab if not already there
        const draftsTab = document.querySelector('.tab-btn[data-tab="drafts"]');
        if (!draftsTab.classList.contains('active')) {
          UIService.activateTab('drafts');
        }
        
        UIService.showNotification('Translation sent to Draft Editor', 'success');
        UIService.updateLastAction('Translation sent to Draft Editor');
        return;
      }
      
      // Handle other export formats as before
      const dateStr = new Date().toISOString().split('T')[0];
      const fileName = `translation_${dateStr}.${format}`;
      
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      UIService.showNotification(`Translation exported as ${fileName}`, 'success');
      UIService.updateLastAction('Translation exported');
    });
  }
}

/**
 * Set up keyboard shortcuts
 */
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', function(e) {
    // Only process if not in an input, textarea or contenteditable
    const target = e.target;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.contentEditable === 'true'
    ) {
      return;
    }
    
    // Ctrl+T: Translate
    if (e.ctrlKey && e.key === 't') {
      e.preventDefault();
      const translateBtn = document.getElementById('translate-btn');
      if (translateBtn) translateBtn.click();
    }
    
    // Ctrl+F: Fetch Chapter
    if (e.ctrlKey && e.key === 'f') {
      e.preventDefault();
      const fetchChapterBtn = document.getElementById('fetch-chapter-btn');
      if (fetchChapterBtn) fetchChapterBtn.click();
    }
    
    // Ctrl+S: Export
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      const exportBtn = document.getElementById('export-btn');
      if (exportBtn) exportBtn.click();
    }
    
    // Ctrl+1-4: Switch tabs
    if (e.ctrlKey && e.key >= '1' && e.key <= '4') {
      e.preventDefault();
      const tabIndex = parseInt(e.key) - 1;
      const tabs = document.querySelectorAll('.tab-btn');
      if (tabs[tabIndex]) {
        tabs[tabIndex].click();
      }
    }
    
    // Escape: Close any open modal
    if (e.key === 'Escape') {
      const openModal = document.querySelector('.modal[style*="display: flex"]');
      if (openModal) {
        openModal.style.display = 'none';
      }
    }
  });
}

/**
 * Initialize publishing controls and event handlers
 */
function initializePublishingControls() {
  // Set up platform card click handlers
  const platformCards = document.querySelectorAll('.platform-card');
  platformCards.forEach(card => {
    card.addEventListener('click', () => {
      const platform = card.dataset.platform;
      DraftService.handlePlatformSelection(platform);
    });
  });

  // Set up publish to all button
  const publishToAllBtn = document.getElementById('publish-to-all-btn');
  if (publishToAllBtn) {
    publishToAllBtn.addEventListener('click', () => {
      DraftService.handlePublishToAll();
    });
  }

  // Initialize platform selection toggle with localStorage persistence
  const platformToggle = document.getElementById('platform-selection-toggle');
  if (platformToggle) {
    // Load saved state from localStorage
    const savedState = localStorage.getItem('showPlatformSelection');
    if (savedState !== null) {
      platformToggle.checked = savedState === 'true';
      document.getElementById('platform-grid').style.display = platformToggle.checked ? 'grid' : 'none';
    }

    // Add change listener
    platformToggle.addEventListener('change', function() {
      const platformGrid = document.getElementById('platform-grid');
      if (platformGrid) {
        platformGrid.style.display = this.checked ? 'grid' : 'none';
      }
      localStorage.setItem('showPlatformSelection', this.checked.toString());
    });
  }
}

// Wait for DOM to be fully loaded, then initialize
document.addEventListener('DOMContentLoaded', initializeApplication);