/**
 * UIService.js - Module for UI interactions and animations
 * Refactored from ui-utils.js to use ES module syntax
 */

import TextService from './TextService.js';

/**
 * Main UIService class with methods for UI management
 */
class UIService {
  constructor() {
    // Set initial state
    this.quill = null;
    this.initialized = false;
    this.searchHighlights = [];
  }

  /**
   * Register Quill instance with UI service
   * @param {Object} quill - Quill editor instance
   */
  registerQuill(quill) {
    this.quill = quill;
  }

  /**
   * Show a notification message
   * @param {string} message - The message to display
   * @param {string} type - Notification type ('success', 'warning', 'error', 'info')
   * @param {number} duration - How long to show the notification in milliseconds
   */
  showNotification(message, type = 'info', duration = 3000) {
    const notification = document.getElementById('notification');
    if (!notification) {
      console.warn('Notification element not found');
      return;
    }

    const messageElement = document.getElementById('notification-message');
    if (!messageElement) {
      console.warn('Notification message element not found');
      return;
    }

    const icon = notification.querySelector('.notification-icon');
    if (!icon) {
      console.warn('Notification icon element not found');
      return;
    }

    // Set message content
    messageElement.textContent = message;

    // Clear previous classes and add the new type
    notification.className = 'notification';
    notification.classList.add(type);
    notification.classList.add('show');

    // Set the appropriate icon
    icon.className = 'notification-icon';
    switch (type) {
      case 'success':
        icon.className += ' fas fa-check-circle';
        break;
      case 'warning':
        icon.className += ' fas fa-exclamation-triangle';
        break;
      case 'error':
        icon.className += ' fas fa-times-circle';
        break;
      default:
        icon.className += ' fas fa-info-circle';
    }

    // Clear any existing timeout to prevent multiple notifications stacking up
    if (notification.dataset.timeoutId) {
      clearTimeout(parseInt(notification.dataset.timeoutId));
    }

    // Hide the notification after the specified duration.  Store the timeout ID.
    const timeoutId = setTimeout(() => {
      notification.classList.remove('show');
    }, duration);
    
    notification.dataset.timeoutId = timeoutId.toString();
  }

  /**
   * Show/hide the loading overlay
   * @param {boolean} show - Whether to show or hide the overlay
   * @param {string} message - Optional message to display
   */
  toggleLoading(show, message = 'Processing...') {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) {
      console.warn('Loading overlay element not found');
      return;
    }

    const messageElement = document.getElementById('loading-message');
    if (!messageElement) {
      console.warn('Loading message element not found');
      return;
    }

    if (show) {
      messageElement.textContent = message;
      overlay.style.display = 'flex';
    } else {
      overlay.style.display = 'none';
    }
  }

  /**
   * Update the progress bar
   * @param {number} percent - Progress percentage (0-100)
   * @param {string} status - Status message
   */
  updateProgress(percent, status) {
    const progressBar = document.getElementById('progress');
    if (!progressBar) {
      console.warn('Progress bar element not found');
      return;
    }

    const progressStatus = document.getElementById('progress-status');
    if (!progressStatus) {
      console.warn('Progress status element not found');
      return;
    }

    progressBar.style.width = percent + '%';

    if (status) {
      progressStatus.textContent = status;
    } else {
      progressStatus.textContent = Math.round(percent) + '%';
    }
  }

  /**
   * Show/hide the progress bar
   * @param {boolean} show - Whether to show or hide the progress bar
   */
  toggleProgressBar(show) {
    const container = document.querySelector('.progress-container');
    if (!container) {
      console.warn('Progress container element not found');
      return;
    }

    if (show) {
      container.style.visibility = 'visible';
      container.style.opacity = '1';
    } else {
      container.style.opacity = '0';
      setTimeout(() => {
        container.style.visibility = 'hidden';
      }, 300);
    }
  }

  /**
   * Activate a tab
   * @param {string} tabId - ID of the tab to activate
   */
  activateTab(tabId) {
    // Deactivate all tabs
    const tabButtons = document.querySelectorAll('.tab-btn');
    if (tabButtons) {
      tabButtons.forEach(tab => {
        tab.classList.remove('active');
      });
    }

    const tabContents = document.querySelectorAll('.tab-content');
    if (tabContents) {
      tabContents.forEach(content => {
        content.classList.remove('active');
      });
    }

    // Activate the selected tab
    const tabButton = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    if (tabButton) tabButton.classList.add('active');

    const tabContent = document.getElementById(tabId + '-tab');
    if (tabContent) tabContent.classList.add('active');

    // Save the active tab in local storage
    localStorage.setItem('activeTab', tabId);
  }

  /**
   * Activate a secondary tab
   * @param {string} tabId - ID of the secondary tab to activate
   */
  activateSecondaryTab(tabId) {
    const tabElement = document.querySelector(`.secondary-tab-btn[data-tab="${tabId}"]`);
    if (!tabElement) return;

    // Get the parent tab content
    const parentTab = tabElement.closest('.tab-content');
    if (!parentTab) return;

    // Deactivate all secondary tabs within this parent
    const secondaryButtons = parentTab.querySelectorAll('.secondary-tab-btn');
    if (secondaryButtons) {
      secondaryButtons.forEach(tab => {
        tab.classList.remove('active');
      });
    }

    const secondaryContents = parentTab.querySelectorAll('.secondary-tab-content');
    if (secondaryContents) {
      secondaryContents.forEach(content => {
        content.classList.remove('active');
      });
    }

    // Activate the selected secondary tab
    tabElement.classList.add('active');

    const secondaryContent = document.getElementById(tabId + '-tab');
    if (secondaryContent) secondaryContent.classList.add('active');

    // Save the active secondary tab in local storage
    localStorage.setItem('activeSecondaryTab-' + parentTab.id, tabId);
  }

  /**
   * Initialize the tab system
   * @private
   */
  initializeTabs() {
    // Set up click handlers for main tabs
    const tabButtons = document.querySelectorAll('.tab-btn');
    if (tabButtons) {
      tabButtons.forEach(tabButton => {
        tabButton.addEventListener('click', () => {
          const tabId = tabButton.dataset.tab;
          this.activateTab(tabId);
        });
      });
    }

    // Set up click handlers for secondary tabs
    const secondaryButtons = document.querySelectorAll('.secondary-tab-btn');
    if (secondaryButtons) {
      secondaryButtons.forEach(tabButton => {
        tabButton.addEventListener('click', () => {
          const tabId = tabButton.dataset.tab;
          this.activateSecondaryTab(tabId);
        });
      });
    }

    // Restore active tabs from localStorage
    const activeMainTab = localStorage.getItem('activeTab');
    if (activeMainTab) {
      this.activateTab(activeMainTab);
    }

    // Restore active secondary tabs
    const tabContents = document.querySelectorAll('.tab-content');
    if (tabContents) {
      tabContents.forEach(tabContent => {
        const activeSecondaryTab = localStorage.getItem('activeSecondaryTab-' + tabContent.id);
        if (activeSecondaryTab) {
          this.activateSecondaryTab(activeSecondaryTab);
        }
      });
    }
  }

  /**
   * Initialize modal functionality
   * @private
   */
  initializeModals() {
    // Close modal when clicking the X or the Cancel button
    const closeButtons = document.querySelectorAll('.modal-close-btn, [id$="-modal-btn"]');
    if (closeButtons) {
      closeButtons.forEach(button => {
        button.addEventListener('click', () => {
          const modal = button.closest('.modal');
          if (modal) {
            modal.style.display = 'none';
          }
        });
      });
    }

    // Close modal when clicking outside the content
    const modals = document.querySelectorAll('.modal');
    if (modals) {
      modals.forEach(modal => {
        modal.addEventListener('click', event => {
          if (event.target === modal) {
            modal.style.display = 'none';
          }
        });
      });
    }

    // Close notification when clicking X
    const notificationClose = document.querySelector('.notification-close');
    if (notificationClose) {
      notificationClose.addEventListener('click', () => {
        const notification = document.getElementById('notification');
        if (notification) notification.classList.remove('show');
      });
    }
  }

  /**
   * Copy text to clipboard
   * @param {string} text - The text to copy
   * @returns {Promise<boolean>} Whether the copy was successful
   */
  copyToClipboard(text) {
    return new Promise((resolve, reject) => {
      try {
        navigator.clipboard.writeText(text)
          .then(() => {
            resolve(true);
          })
          .catch(err => {
            console.error('Failed to copy text: ', err);
            reject(err);
          });
      } catch (err) {
        console.error('Failed to copy text: ', err);
        reject(err);
      }
    });
  }

  /**
   * Set the theme (light/dark)
   * @param {string} theme - The theme to set ('light' or 'dark')
   */
  setTheme(theme) {
    document.body.classList.remove('light-mode', 'dark-mode');
    document.body.classList.add(theme + '-mode');

    // Update the theme toggle button icon
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
      themeToggle.innerHTML = theme === 'dark'
        ? '<i class="fas fa-sun"></i>'
        : '<i class="fas fa-moon"></i>';
    }

    // Save the setting
    localStorage.setItem('theme', theme);

    // Update any theme-dependent elements
    const themeRadios = document.querySelectorAll('[name="theme"]');
    if (themeRadios) {
      themeRadios.forEach(radio => {
        radio.checked = radio.value === theme;
      });
    }
  }

  /**
   * Set the accent color
   * @param {string} color - The color to set (hex format)
   */
  setAccentColor(color) {
    // Convert hex to RGB for CSS variables
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);

    // Set CSS variables
    document.documentElement.style.setProperty('--accent-color', color);
    document.documentElement.style.setProperty('--accent-r', r);
    document.documentElement.style.setProperty('--accent-g', g);
    document.documentElement.style.setProperty('--accent-b', b);

    // Calculate a darker shade for hover states
    const darkenFactor = 0.8;
    const darkerR = Math.floor(r * darkenFactor);
    const darkerG = Math.floor(g * darkenFactor);
    const darkerB = Math.floor(b * darkenFactor);
    const darkerHex = '#' +
      darkerR.toString(16).padStart(2, '0') +
      darkerG.toString(16).padStart(2, '0') +
      darkerB.toString(16).padStart(2, '0');

    document.documentElement.style.setProperty('--accent-hover', darkerHex);

    // Update color inputs
    const colorInputs = document.querySelectorAll('[type="color"]');
    if (colorInputs) {
      colorInputs.forEach(input => {
        if (input.id === 'theme-color' || input.id === 'accent-color') {
          input.value = color;
        }
      });
    }

    // Save the setting
    localStorage.setItem('accentColor', color);
  }

  /**
   * Update the last action display
   * @param {string} action - The action to display
   */
  updateLastAction(action) {
    const lastAction = document.getElementById('last-action');
    if (lastAction) lastAction.textContent = action;

    // Also update the last saved timestamp if appropriate
    if (action.includes('saved') || action.includes('updated')) {
      const lastSaved = document.getElementById('last-saved');
      if (lastSaved) lastSaved.textContent = 'Last saved: ' + new Date().toLocaleTimeString();
    }
  }

  /**
   * Update word count displays
   */
  updateWordCounts() {
    try {
      const inputText = document.getElementById('input-text');
      const inputWordCount = document.getElementById('input-word-count');
      const chapterText = document.getElementById('chapter-text');
      const chapterWordCount = document.getElementById('chapter-word-count');
      const outputWordCount = document.getElementById('output-word-count');
      const wordCountStat = document.getElementById('word-count');
      const readingTime = document.getElementById('reading-time');

      // Update input word count
      if (inputText && inputWordCount) {
        const count = TextService.countWords(inputText.value);
        inputWordCount.textContent = count + ' words';
      }

      // Update chapter word count
      if (chapterText && chapterWordCount) {
        const count = TextService.countWords(chapterText.value);
        chapterWordCount.textContent = count + ' words';
      }

      // Update output word count if Quill is initialized
      if (this.quill && outputWordCount) {
        const count = TextService.countWords(this.quill.getText());
        outputWordCount.textContent = count + ' words';

        // Update global word count and reading time
        if (wordCountStat) {
          wordCountStat.textContent = count + ' words';
        }

        if (readingTime) {
          const minutes = TextService.estimateReadingTime(this.quill.getText());
          readingTime.textContent = minutes + ' min read';
        }
      }
    } catch (error) {
      console.error("Error updating word counts:", error);
    }
  }

  /**
   * Initialize Quill rich text editor
   * @returns {Object|null} Quill instance or null if initialization failed
   * @private
   */
  initializeQuill() {
    if (!window.Quill) {
      console.error('Quill library not loaded');
      return null;
    }

    // Check if Quill is already initialized
    if (!this.quill) {
      const quillContainer = document.getElementById('translation-output');
      if (!quillContainer) {
        console.error('Quill container not found');
        return null;
      }

      this.quill = new window.Quill('#translation-output', {
        theme: 'bubble',
        modules: {
          toolbar: false, // No toolbar for the output
          history: {     // Enable undo/redo
            delay: 1000,
            maxStack: 100,
            userOnly: true
          }
        },
        placeholder: ''
      });

      // Add change listener to update word count
      this.quill.on('text-change', () => {
        this.updateWordCounts();
      });

      // Set initial content AFTER Quill is initialized
      this.quill.setContents([{ insert: '\n' }]); // Add an empty paragraph

      // Setup event handlers after a slight delay
      setTimeout(() => {
        this.setupQuillEventHandlers();
      }, 0);
    }

    return this.quill;
  }

  /**
   * Set up event handlers for Quill editor
   * @private
   */
  setupQuillEventHandlers() {
    if (!this.quill) return;

    // Set up undo/redo buttons
    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) {
      undoBtn.addEventListener('click', () => {
        if (this.quill) {
          this.quill.history.undo();
          this.updateLastAction('Undo applied');
          this.updateWordCounts();
        }
      });
    }

    const redoBtn = document.getElementById('redo-btn');
    if (redoBtn) {
      redoBtn.addEventListener('click', () => {
        if (this.quill) {
          this.quill.history.redo();
          this.updateLastAction('Redo applied');
          this.updateWordCounts();
        }
      });
    }
  }

  /**
   * Toggle sidebar visibility
   */
  toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      sidebar.classList.toggle('collapsed');

      // Save state
      localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
    }
  }

  /**
   * Toggle status bar visibility
   */
  toggleStatusBar() {
    const statusBar = document.querySelector('.status-bar');
    if (statusBar) {
      statusBar.classList.toggle('hidden');

      // Save state
      localStorage.setItem('statusBarHidden', statusBar.classList.contains('hidden'));
    }
  }

  /**
   * Create a particle background effect
   * @private
   */
  initializeParticles() {
    const particlesContainer = document.getElementById('particles');
    if (!particlesContainer) return;

    const particleCount = 50;

    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div');
      particle.className = 'particle';

      // Random properties
      const size = Math.random() * 4 + 1;
      const posX = Math.random() * 100;
      const posY = Math.random() * 100;
      const duration = Math.random() * 20 + 10;
      const delay = Math.random() * 5;

      // Set styles
      particle.style.width = size + 'px';
      particle.style.height = size + 'px';
      particle.style.left = posX + '%';
      particle.style.top = posY + '%';
      particle.style.opacity = Math.random() * 0.3 + 0.1;
      particle.style.animation = 'float ' + duration + 's linear infinite';
      particle.style.animationDelay = '-' + delay + 's';

      particlesContainer.appendChild(particle);
    }
  }

  /**
   * Get Quill instance
   * @returns {Object|null} Quill instance or null if not initialized
   */
  getQuill() {
    return this.quill;
  }
  
  /**
   * Highlight search matches in text
   * @param {string} text - Text to search in
   * @param {string} query - Search query
   * @param {string} highlightClass - CSS class for highlighting
   * @returns {string} HTML with highlighted matches
   */
  highlightSearchMatches(text, query, highlightClass = 'search-highlight') {
    if (!text || !query) return text;
    
    try {
      const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escapedQuery, 'gi');
      
      return text.replace(regex, match => `<span class="${highlightClass}">${match}</span>`);
    } catch (error) {
      console.error('Error highlighting matches:', error);
      return text;
    }
  }
  
  /**
   * Clear search highlights
   * @param {HTMLElement} container - Container element with highlights
   */
  clearSearchHighlights(container) {
    if (!container) return;
    
    try {
      const highlights = container.querySelectorAll('.search-highlight');
      highlights.forEach(highlight => {
        const text = highlight.textContent;
        const textNode = document.createTextNode(text);
        highlight.parentNode.replaceChild(textNode, highlight);
      });
      
      // Also normalize the container to merge adjacent text nodes
      container.normalize();
    } catch (error) {
      console.error('Error clearing highlights:', error);
    }
  }
  
  /**
   * Show draft-specific notification
   * @param {string} message - The message to display
   * @param {string} type - Notification type ('success', 'warning', 'error', 'info')
   * @param {number} duration - How long to show the notification in milliseconds
   */
  showDraftNotification(message, type = 'info', duration = 3000) {
    // Use the same method as showNotification but with a prefix
    this.showNotification(`[Draft] ${message}`, type, duration);
  }
  
  /**
   * Get draft Quill instance from DraftService
   * @returns {Object|null} Quill instance or null 
   */
  async getDraftQuill() {
    try {
      // Dynamically import DraftService to avoid circular dependencies
      const module = await import('../services/DraftService.js');
      const DraftService = module.default;
      
      return DraftService.draftQuill;
    } catch (error) {
      console.error('Error getting draft Quill:', error);
      return null;
    }
  }

  /**
   * Initialize all UI elements from saved settings
   */
  initialize() {
    if (this.initialized) return;
    
    console.log('Initializing UI elements');

    try {
      // Set up theme
      const savedTheme = localStorage.getItem('theme') || 'dark';
      this.setTheme(savedTheme);

      // Set up accent color
      const savedColor = localStorage.getItem('accentColor') || '#00aaff';
      this.setAccentColor(savedColor);

      // Initialize tabs
      this.initializeTabs();

      // Initialize modals
      this.initializeModals();

      // Set up theme toggle button
      const themeToggleBtn = document.getElementById('theme-toggle');
      if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
          const currentTheme = document.body.classList.contains('dark-mode') ? 'dark' : 'light';
          const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
          this.setTheme(newTheme);
        });
      }

      // Set up theme color picker
      const themeColorPicker = document.getElementById('theme-color');
      if (themeColorPicker) {
        themeColorPicker.addEventListener('change', (e) => {
          this.setAccentColor(e.target.value);
        });
      }

      const accentColorPicker = document.getElementById('accent-color');
      if (accentColorPicker) {
        accentColorPicker.addEventListener('change', (e) => {
          this.setAccentColor(e.target.value);
        });
      }

      // Set up sidebar toggle
      const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
      if (sidebarToggleBtn) {
        sidebarToggleBtn.addEventListener('click', () => {
          this.toggleSidebar();
        });
      }

      // Restore sidebar state
      if (localStorage.getItem('sidebarCollapsed') === 'true') {
        this.toggleSidebar();
      }

      // Set up status bar toggle
      const statusBarToggleBtn = document.getElementById('toggle-status-bar-btn');
      if (statusBarToggleBtn) {
        statusBarToggleBtn.addEventListener('click', () => {
          this.toggleStatusBar();
        });
      }

      // Restore status bar state
      if (localStorage.getItem('statusBarHidden') === 'true') {
        this.toggleStatusBar();
      }

      // Create particle background
      this.initializeParticles();

      // Set up help button
      const helpBtn = document.getElementById('help-btn');
      if (helpBtn) {
        helpBtn.addEventListener('click', () => {
          const helpModal = document.getElementById('help-modal');
          if (helpModal) {
            helpModal.style.display = 'flex';
          }
        });
      }
      
      // Initialize textarea event listeners
      const inputTextArea = document.getElementById('input-text');
      if (inputTextArea) {
        inputTextArea.addEventListener('input', () => {
          this.updateWordCounts();
        });
      }

      const chapterTextArea = document.getElementById('chapter-text');
      if (chapterTextArea) {
        chapterTextArea.addEventListener('input', () => {
          this.updateWordCounts();
        });
      }
      
      // Load and set glossary toggle state
      const applyGlossaryToggle = document.getElementById('apply-glossary-toggle');
      if (applyGlossaryToggle) {
        const savedToggleState = localStorage.getItem('applyGlossary');
        // Default to true if no saved state
        applyGlossaryToggle.checked = savedToggleState === null ? true : savedToggleState === 'true';
        // Add event listener
        applyGlossaryToggle.addEventListener('change', () => {
          localStorage.setItem('applyGlossary', applyGlossaryToggle.checked);
        });
      }

      // Set up copy output button
      const copyOutputBtn = document.getElementById('copy-output-btn');
      if (copyOutputBtn) {
        copyOutputBtn.addEventListener('click', () => {
          if (this.quill) {
            const text = this.quill.getText(); // Get plain text
            this.copyToClipboard(text)
              .then(() => {
                this.showNotification('Translation copied to clipboard', 'success');
                this.updateLastAction('Translation copied to clipboard');
              })
              .catch(() => {
                this.showNotification('Failed to copy to clipboard', 'error');
              });
          }
        });
      }
      
      // Set up clear output button
      const clearOutputBtn = document.getElementById('clear-output-btn');
      if (clearOutputBtn) {
        clearOutputBtn.addEventListener('click', () => {
          if (this.quill) {
            if (confirm('Are you sure you want to clear the translation?')) {
              this.quill.setText(''); // Clear the content
              this.updateWordCounts();
              this.showNotification('Translation cleared', 'info');
              this.updateLastAction('Translation cleared');

              // Handle project update through a custom event
              document.dispatchEvent(new CustomEvent('project-output-cleared'));
            }
          }
        });
      }

      // Set up copy input button
      const copyInputBtn = document.getElementById('copy-input-btn');
      if (copyInputBtn) {
        copyInputBtn.addEventListener('click', () => {
          const inputText = document.getElementById('input-text');
          if (inputText) {
            this.copyToClipboard(inputText.value)
              .then(() => {
                this.showNotification('Input text copied to clipboard', 'success');
                this.updateLastAction('Input text copied');
              })
              .catch(() => {
                this.showNotification('Failed to copy to clipboard', 'error');
              });
          }
        });
      }

      // Set up clear input button
      const clearInputBtn = document.getElementById('clear-input-btn');
      if (clearInputBtn) {
        clearInputBtn.addEventListener('click', () => {
          const inputText = document.getElementById('input-text');
          if (inputText && confirm('Are you sure you want to clear the input text?')) {
            inputText.value = '';
            this.updateWordCounts();
            this.showNotification('Input text cleared', 'info');
            this.updateLastAction('Input text cleared');
          }
        });
      }

      // Initialize Quill and set up event handlers
      this.initializeQuill();
      
      // Listen for Quill to be loaded. This solves timing issues.
      document.addEventListener('quill-loaded', () => {
        this.setupQuillEventHandlers();
      });

      // Initial word count update
      this.updateWordCounts();
      
      this.initialized = true;
      console.log('UI initialization completed successfully');
    } catch (error) {
      console.error('Error initializing UI:', error);
    }
  }
}

// Create a singleton instance
const uiService = new UIService();

// Export default instance
export default uiService;

// Also export the class for testing or extending
export { UIService };