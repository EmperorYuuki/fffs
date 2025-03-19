/**
 * DraftService.js - Module for managing draft documents
 * Handles draft creation, editing, saving, and publishing
 */

// Import core utilities
import StorageService from '../core/StorageService.js';
import UIService from '../core/UIService.js';
import TextService from '../core/TextService.js';

// Import required services
import ProjectService from './ProjectService.js';
import publishingService from './PublishingService.js';

/**
 * Class for managing drafts including CRUD operations, search/replace, and publishing
 */
class DraftService {
  /**
   * Create a new DraftService instance
   */
  constructor() {
    // Current active draft
    this.currentDraft = null;
    
    // Search state
    this.searchState = {
      query: '',
      matches: [],
      currentMatchIndex: -1
    };
    
    // Quill editor instance for drafts
    this.draftQuill = null;
    
    // Store history of draft versions
    this.versionHistory = new Map();
  }

  /**
   * Initialize the draft service
   * @returns {Promise<void>} Promise that resolves when initialization is complete
   */
  async initialize() {
    try {
      console.log('Initializing DraftService');
      
      // Initialize draft editor if it exists
      this.initializeDraftEditor();
      
      // Set up event listeners
      this.setupEventListeners();
      
      // Load drafts for the current project if one is selected
      const currentProject = ProjectService.getCurrentProject();
      if (currentProject) {
        await this.loadDraftsForProject(currentProject.id);
      }
      
      console.log('DraftService initialized successfully');
    } catch (error) {
      console.error('Error initializing draft service:', error);
      throw error;
    }
  }
  
  /**
   * Initialize the Quill editor for drafts
   * @private
   */
  initializeDraftEditor() {
    if (!window.Quill) {
      console.error('Quill library not loaded');
      return;
    }
    
    try {
      const editorContainer = document.getElementById('draft-editor');
      if (!editorContainer) {
        console.warn('Draft editor container not found');
        return;
      }
      
      // Define toolbar options
      const toolbarOptions = [
        ['bold', 'italic', 'underline', 'strike'],        // toggled buttons
        ['blockquote', 'code-block'],
        
        [{ 'header': 1 }, { 'header': 2 }],               // custom button values
        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        [{ 'script': 'sub'}, { 'script': 'super' }],      // superscript/subscript
        [{ 'indent': '-1'}, { 'indent': '+1' }],          // outdent/indent
        [{ 'direction': 'rtl' }],                         // text direction
        
        [{ 'size': ['small', false, 'large', 'huge'] }],  // custom dropdown
        [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
        
        [{ 'color': [] }, { 'background': [] }],          // dropdown with defaults
        [{ 'font': [] }],
        [{ 'align': [] }],
        
        ['clean'],                                         // remove formatting button
        
        ['link', 'image']                                 // link and image
      ];
      
      // Create the editor
      this.draftQuill = new window.Quill('#draft-editor', {
        modules: {
          toolbar: toolbarOptions,
          history: {
            delay: 1000,
            maxStack: 100,
            userOnly: true
          }
        },
        placeholder: 'Start writing your draft...',
        theme: 'snow'
      });
      
      // Add change listener to update word count and auto-save
      this.draftQuill.on('text-change', this.handleQuillTextChange.bind(this));
      
      console.log('Draft editor initialized');
    } catch (error) {
      console.error('Error initializing draft editor:', error);
    }
  }
  
  /**
   * Handle text changes in the Quill editor
   * @param {Delta} delta - The changes that were made
   * @param {Delta} oldDelta - The previous state
   * @param {string} source - The source of the change ('user' or 'api')
   * @private
   */
  handleQuillTextChange(delta, oldDelta, source) {
    // Only process changes made by the user, not programmatic changes
    if (source !== 'user') return;
    
    // Update word count display
    this.updateDraftWordCount();
    
    // Auto-save after delay if we have a current draft
    if (this.currentDraft) {
      if (this.autoSaveTimeout) {
        clearTimeout(this.autoSaveTimeout);
      }
      
      this.autoSaveTimeout = setTimeout(() => {
        this.saveDraft(true); // Save as auto-save
      }, 3000);
    }
  }
  
  /**
   * Set up all event listeners for draft functionality
   * @private
   */
  setupEventListeners() {
    try {
      // New draft button
      const newDraftBtn = document.getElementById('new-draft-btn');
      if (newDraftBtn) {
        newDraftBtn.addEventListener('click', () => this.handleNewDraft());
      }
      
      // Save draft button
      const saveDraftBtn = document.getElementById('save-draft-btn');
      if (saveDraftBtn) {
        saveDraftBtn.addEventListener('click', () => this.saveDraft(false));
      }
      
      // Import from translation button
      const importFromTranslationBtn = document.getElementById('import-from-translation-btn');
      if (importFromTranslationBtn) {
        importFromTranslationBtn.addEventListener('click', () => this.handleImportFromTranslation());
      }
      
      // Draft search button
      const searchBtn = document.getElementById('draft-search-btn');
      if (searchBtn) {
        searchBtn.addEventListener('click', () => this.handleSearch());
      }
      
      // Draft search input (search on Enter key)
      const searchInput = document.getElementById('draft-search');
      if (searchInput) {
        searchInput.addEventListener('keyup', e => {
          if (e.key === 'Enter') {
            this.handleSearch();
          }
        });
      }
      
      // Replace button
      const replaceBtn = document.getElementById('draft-replace-btn');
      if (replaceBtn) {
        replaceBtn.addEventListener('click', () => this.handleReplace());
      }
      
      // Replace all button
      const replaceAllBtn = document.getElementById('draft-replace-all-btn');
      if (replaceAllBtn) {
        replaceAllBtn.addEventListener('click', () => this.handleReplaceAll());
      }
      
      // Navigation through search results
      const prevMatchBtn = document.getElementById('prev-match-btn');
      if (prevMatchBtn) {
        prevMatchBtn.addEventListener('click', () => this.navigateToPreviousMatch());
      }
      
      const nextMatchBtn = document.getElementById('next-match-btn');
      if (nextMatchBtn) {
        nextMatchBtn.addEventListener('click', () => this.navigateToNextMatch());
      }
      
      // Draft title change
      const draftTitleInput = document.getElementById('draft-title');
      if (draftTitleInput) {
        draftTitleInput.addEventListener('blur', () => this.handleTitleChange());
      }
      
      // Draft history button
      const historyBtn = document.getElementById('draft-history-btn');
      if (historyBtn) {
        historyBtn.addEventListener('click', () => this.handleShowHistory());
      }
      
      // Restore version button
      const restoreVersionBtn = document.getElementById('restore-version-btn');
      if (restoreVersionBtn) {
        restoreVersionBtn.addEventListener('click', () => this.handleRestoreVersion());
      }
      
      // Preview draft button
      const previewDraftBtn = document.getElementById('preview-draft-btn');
      if (previewDraftBtn) {
        previewDraftBtn.addEventListener('click', () => this.handlePreviewDraft());
      }
      
      // Publish draft button
      const publishDraftBtn = document.getElementById('publish-draft-btn');
      if (publishDraftBtn) {
        publishDraftBtn.addEventListener('click', () => this.handlePublishDraft());
      }
      
      // Platform cards in publish tab
      const platformCards = document.querySelectorAll('.platform-card');
      if (platformCards) {
        platformCards.forEach(card => {
          card.addEventListener('click', () => {
            const platform = card.dataset.platform;
            this.handlePlatformSelection(platform);
          });
        });
      }
      
      // WordPress publish button
      const wpPublishBtn = document.getElementById('wp-publish-btn');
      if (wpPublishBtn) {
        wpPublishBtn.addEventListener('click', () => this.handleWordPressPublish());
      }
      
      // Medium publish button
      const mediumPublishBtn = document.getElementById('medium-publish-btn');
      if (mediumPublishBtn) {
        mediumPublishBtn.addEventListener('click', () => this.handleMediumPublish());
      }
      
      // Ghost publish button
      const ghostPublishBtn = document.getElementById('ghost-publish-btn');
      if (ghostPublishBtn) {
        ghostPublishBtn.addEventListener('click', () => this.handleGhostPublish());
      }
      
      // Custom HTML export
      const customHtmlBtn = document.getElementById('copy-html-btn');
      if (customHtmlBtn) {
        customHtmlBtn.addEventListener('click', () => this.handleCopyHtml());
      }
      
      const downloadHtmlBtn = document.getElementById('download-html-btn');
      if (downloadHtmlBtn) {
        downloadHtmlBtn.addEventListener('click', () => this.handleDownloadHtml());
      }
      
      // Library filters
      const statusFilter = document.getElementById('draft-status-filter');
      if (statusFilter) {
        statusFilter.addEventListener('change', () => this.applyDraftFilters());
      }
      
      const sortBy = document.getElementById('draft-sort-by');
      if (sortBy) {
        sortBy.addEventListener('change', () => this.applyDraftFilters());
      }
      
      // Listen for project changes
      document.addEventListener('project-changed', e => {
        if (e.detail && e.detail.projectId) {
          this.loadDraftsForProject(e.detail.projectId);
        }
      });
      
      // Select all drafts
      const selectAllDrafts = document.getElementById('select-all-drafts');
      if (selectAllDrafts) {
        selectAllDrafts.addEventListener('change', e => this.handleSelectAllDrafts(e));
      }
      
      // Delete selected drafts
      const deleteSelectedDrafts = document.getElementById('delete-selected-drafts');
      if (deleteSelectedDrafts) {
        deleteSelectedDrafts.addEventListener('click', () => this.handleDeleteSelectedDrafts());
      }
      
      // Export selected drafts
      const exportSelectedDrafts = document.getElementById('export-selected-drafts');
      if (exportSelectedDrafts) {
        exportSelectedDrafts.addEventListener('click', () => this.handleExportSelectedDrafts());
      }
      
      console.log('Draft event listeners initialized');
    } catch (error) {
      console.error('Error setting up draft event listeners:', error);
    }
  }
  
  /**
   * Create a new draft
   * @returns {Promise<Object>} The created draft
   */
  async createDraft(title = 'Untitled Draft') {
    try {
      const currentProject = ProjectService.getCurrentProject();
      if (!currentProject) {
        throw new Error('No project selected. Please select or create a project first.');
      }
      
      const draft = {
        id: StorageService.generateUUID(),
        projectId: currentProject.id,
        title: title,
        content: JSON.stringify([{ insert: '\n' }]), // Empty Quill Delta
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        tags: [],
        status: 'draft',
        version: '1.0',
        wordCount: 0,
        publishHistory: []
      };
      
      await StorageService.saveItem('drafts', draft);
      
      // Add empty version to history
      this.addToVersionHistory(draft.id, {
        timestamp: draft.created,
        content: draft.content,
        version: draft.version,
        wordCount: 0
      });
      
      return draft;
    } catch (error) {
      console.error('Error creating draft:', error);
      throw error;
    }
  }
  
  /**
   * Handle new draft button click
   * @private
   */
  async handleNewDraft() {
    try {
      // Check if there are unsaved changes
      if (this.currentDraft && this.hasUnsavedChanges()) {
        const confirmed = confirm('You have unsaved changes. Create a new draft anyway?');
        if (!confirmed) return;
      }
      
      UIService.toggleLoading(true, 'Creating new draft...');
      
      const draft = await this.createDraft();
      await this.setCurrentDraft(draft.id);
      await this.renderDraftsList();
      
      UIService.toggleLoading(false);
      UIService.showNotification('New draft created', 'success');
      UIService.updateLastAction('Draft created');
    } catch (error) {
      console.error('Error handling new draft:', error);
      UIService.toggleLoading(false);
      UIService.showNotification(`Error creating draft: ${error.message}`, 'error');
    }
  }
  
  /**
   * Save the current draft
   * @param {boolean} isAutoSave - Whether this is an automatic save
   * @returns {Promise<Object|null>} The saved draft or null if no draft to save
   */
  async saveDraft(isAutoSave = false) {
    try {
      if (!this.currentDraft) {
        return null;
      }
      
      if (!this.draftQuill) {
        throw new Error('Editor not initialized');
      }
      
      // Get current content
      const content = JSON.stringify(this.draftQuill.getContents());
      
      // Check if content actually changed (to avoid unnecessary version updates)
      const contentChanged = content !== this.currentDraft.content;
      
      // Get word count
      const text = this.draftQuill.getText();
      const wordCount = TextService.countWords(text);
      
      // Get title
      const titleInput = document.getElementById('draft-title');
      const title = titleInput ? titleInput.value.trim() : this.currentDraft.title;
      
      // If nothing changed and this is an auto-save, don't proceed
      if (!contentChanged && title === this.currentDraft.title && isAutoSave) {
        return this.currentDraft;
      }
      
      if (!isAutoSave) {
        UIService.toggleLoading(true, 'Saving draft...');
      }
      
      // If content changed significantly, increment version
      let version = this.currentDraft.version;
      if (contentChanged && !isAutoSave) {
        // Only increment version on manual saves with content changes
        version = this.incrementVersion(version);
      }
      
      // Update draft object
      const updatedDraft = {
        ...this.currentDraft,
        title: title,
        content: content,
        modified: new Date().toISOString(),
        wordCount: wordCount,
        version: version
      };
      
      // Save to database
      await StorageService.saveItem('drafts', updatedDraft);
      
      // Update current draft
      this.currentDraft = updatedDraft;
      
      // Add to version history on manual save or significant auto-save changes
      if (!isAutoSave || (contentChanged && Math.abs(wordCount - this.currentDraft.wordCount) > 50)) {
        this.addToVersionHistory(updatedDraft.id, {
          timestamp: updatedDraft.modified,
          content: content,
          version: version,
          wordCount: wordCount
        });
      }
      
      // Update last saved display
      const lastSaved = document.getElementById('draft-last-saved');
      if (lastSaved) {
        lastSaved.textContent = 'Last saved: ' + new Date().toLocaleTimeString();
      }
      
      // Update version display
      const versionDisplay = document.getElementById('draft-version');
      if (versionDisplay) {
        versionDisplay.textContent = 'Version ' + version;
      }
      
      if (!isAutoSave) {
        UIService.toggleLoading(false);
        UIService.showNotification('Draft saved', 'success');
        UIService.updateLastAction('Draft saved');
      }
      
      return updatedDraft;
    } catch (error) {
      console.error('Error saving draft:', error);
      if (!isAutoSave) {
        UIService.toggleLoading(false);
        UIService.showNotification(`Error saving draft: ${error.message}`, 'error');
      }
      return null;
    }
  }
  
  /**
   * Set the current draft
   * @param {string} id - Draft ID
   * @returns {Promise<Object|null>} The selected draft or null if not found
   */
  async setCurrentDraft(id) {
    try {
      // Save current draft if there are changes
      if (this.currentDraft && this.hasUnsavedChanges()) {
        await this.saveDraft(false);
      }
      
      // Load the requested draft
      const draft = await StorageService.getItem('drafts', id);
      if (!draft) {
        throw new Error(`Draft with ID "${id}" not found`);
      }
      
      this.currentDraft = draft;
      
      // Update UI
      this.updateDraftUI(draft);
      
      return draft;
    } catch (error) {
      console.error('Error setting current draft:', error);
      UIService.showNotification(`Error loading draft: ${error.message}`, 'error');
      return null;
    }
  }
  
  /**
   * Update the UI to reflect the current draft
   * @param {Object} draft - The draft to display
   * @private
   */
  updateDraftUI(draft) {
    try {
      if (!this.draftQuill) {
        console.error('Draft editor not initialized');
        return;
      }
      
      // Clear any current search highlights
      this.clearSearch();
      
      // Set editor content
      try {
        const delta = JSON.parse(draft.content);
        this.draftQuill.setContents(delta);
      } catch (e) {
        console.warn('Could not parse draft content', e);
        this.draftQuill.setText('');
      }
      
      // Set title
      const titleInput = document.getElementById('draft-title');
      if (titleInput) titleInput.value = draft.title;
      
      // Update status badge
      const statusBadge = document.getElementById('draft-status');
      if (statusBadge) {
        statusBadge.textContent = draft.status.charAt(0).toUpperCase() + draft.status.slice(1);
        statusBadge.className = 'draft-status-badge ' + draft.status;
      }
      
      // Update last saved
      const lastSaved = document.getElementById('draft-last-saved');
      if (lastSaved) {
        const date = new Date(draft.modified);
        lastSaved.textContent = 'Last saved: ' + date.toLocaleTimeString();
      }
      
      // Update version
      const versionDisplay = document.getElementById('draft-version');
      if (versionDisplay) {
        versionDisplay.textContent = 'Version ' + draft.version;
      }
      
      // Update word count
      this.updateDraftWordCount();
      
      // Mark active draft in the drafts list
      const draftItems = document.querySelectorAll('.drafts-table tr');
      draftItems.forEach(item => {
        item.classList.remove('active');
        if (item.dataset.id === draft.id) {
          item.classList.add('active');
        }
      });
    } catch (error) {
      console.error('Error updating draft UI:', error);
    }
  }
  
  /**
   * Check if there are unsaved changes in the current draft
   * @returns {boolean} True if there are unsaved changes
   */
  hasUnsavedChanges() {
    if (!this.currentDraft || !this.draftQuill) return false;
    
    try {
      const currentContent = JSON.stringify(this.draftQuill.getContents());
      return currentContent !== this.currentDraft.content;
    } catch (error) {
      console.error('Error checking for unsaved changes:', error);
      return false;
    }
  }
  
  /**
   * Update the word count display for the current draft
   * @private
   */
  updateDraftWordCount() {
    try {
      if (!this.draftQuill) return;
      
      const text = this.draftQuill.getText();
      const wordCount = TextService.countWords(text);
      const readingTime = TextService.estimateReadingTime(text);
      
      const wordCountEl = document.getElementById('draft-word-count');
      if (wordCountEl) wordCountEl.textContent = wordCount + ' words';
      
      const readingTimeEl = document.getElementById('draft-reading-time');
      if (readingTimeEl) readingTimeEl.textContent = readingTime + ' min read';
      
      return wordCount;
    } catch (error) {
      console.error('Error updating draft word count:', error);
      return 0;
    }
  }
  
  /**
   * Add a version to the history
   * @param {string} draftId - The draft ID
   * @param {Object} versionData - The version data to store
   * @private
   */
  addToVersionHistory(draftId, versionData) {
    try {
      if (!this.versionHistory.has(draftId)) {
        this.versionHistory.set(draftId, []);
      }
      
      const history = this.versionHistory.get(draftId);
      
      // Add to beginning of array (most recent first)
      history.unshift(versionData);
      
      // Limit history to 10 versions
      if (history.length > 10) {
        history.pop();
      }
    } catch (error) {
      console.error('Error adding to version history:', error);
    }
  }
  
  /**
   * Increment the version number
   * @param {string} version - Current version string (e.g., "1.2")
   * @returns {string} Incremented version
   * @private
   */
  incrementVersion(version) {
    try {
      const parts = version.split('.');
      if (parts.length !== 2) return '1.0';
      
      let major = parseInt(parts[0]);
      let minor = parseInt(parts[1]);
      
      minor++;
      if (minor >= 10) {
        major++;
        minor = 0;
      }
      
      return `${major}.${minor}`;
    } catch (error) {
      console.error('Error incrementing version:', error);
      return '1.0';
    }
  }
  
  /**
   * Handle search in the draft editor
   * @private
   */
  handleSearch() {
    try {
      const searchInput = document.getElementById('draft-search');
      if (!searchInput || !this.draftQuill) return;
      
      const query = searchInput.value.trim();
      if (query === '') {
        this.clearSearch();
        return;
      }
      
      // Clear previous search
      this.clearSearch();
      
      // Update search state
      this.searchState.query = query;
      this.searchState.matches = [];
      this.searchState.currentMatchIndex = -1;
      
      // Get editor content
      const text = this.draftQuill.getText();
      
      // Find all matches
      let match;
      const regex = new RegExp(this.escapeRegExp(query), 'gi');
      
      while ((match = regex.exec(text)) !== null) {
        this.searchState.matches.push({
          index: match.index,
          length: match[0].length
        });
      }
      
      // Update match count display
      const matchCount = document.getElementById('search-results-count');
      if (matchCount) {
        matchCount.textContent = this.searchState.matches.length + ' matches';
      }
      
      // Update navigation buttons
      this.updateSearchNavigationButtons();
      
      // Navigate to first match if found
      if (this.searchState.matches.length > 0) {
        this.navigateToMatch(0);
      }
    } catch (error) {
      console.error('Error performing search:', error);
      UIService.showNotification('Error performing search', 'error');
    }
  }
  
  /**
   * Navigate to a specific match
   * @param {number} index - Index of the match to navigate to
   * @private
   */
  navigateToMatch(index) {
    try {
      if (!this.draftQuill || !this.searchState.matches.length) return;
      
      if (index < 0 || index >= this.searchState.matches.length) return;
      
      // Update current index
      this.searchState.currentMatchIndex = index;
      
      // Get match information
      const match = this.searchState.matches[index];
      
      // Scroll to match position
      this.draftQuill.setSelection(match.index, match.length);
      
      // Highlight all matches
      this.highlightAllMatches();
      
      // Update navigation buttons
      this.updateSearchNavigationButtons();
    } catch (error) {
      console.error('Error navigating to match:', error);
    }
  }
  
  /**
   * Navigate to the next match
   * @private
   */
  navigateToNextMatch() {
    try {
      if (!this.searchState.matches.length) return;
      
      let nextIndex = this.searchState.currentMatchIndex + 1;
      if (nextIndex >= this.searchState.matches.length) {
        nextIndex = 0; // Wrap around to beginning
      }
      
      this.navigateToMatch(nextIndex);
    } catch (error) {
      console.error('Error navigating to next match:', error);
    }
  }
  
  /**
   * Navigate to the previous match
   * @private
   */
  navigateToPreviousMatch() {
    try {
      if (!this.searchState.matches.length) return;
      
      let prevIndex = this.searchState.currentMatchIndex - 1;
      if (prevIndex < 0) {
        prevIndex = this.searchState.matches.length - 1; // Wrap around to end
      }
      
      this.navigateToMatch(prevIndex);
    } catch (error) {
      console.error('Error navigating to previous match:', error);
    }
  }
  
  /**
   * Highlight all matches in the editor
   * @private
   */
  highlightAllMatches() {
    try {
      if (!this.draftQuill || !this.searchState.matches.length) return;
      
      // Save current selection
      const currentSelection = this.draftQuill.getSelection();
      
      // Remove existing highlights
      this.removeAllHighlights();
      
      // Add highlights for all matches
      this.searchState.matches.forEach((match, index) => {
        const highlightClass = index === this.searchState.currentMatchIndex 
          ? 'search-match-current' 
          : 'search-match';
        
        this.draftQuill.formatText(match.index, match.length, {
          'background': index === this.searchState.currentMatchIndex ? '#ffcc00' : '#ffff00',
          'color': 'black'
        });
      });
      
      // Restore selection if it exists
      if (currentSelection) {
        this.draftQuill.setSelection(currentSelection.index, currentSelection.length);
      }
    } catch (error) {
      console.error('Error highlighting matches:', error);
    }
  }
  
  /**
   * Remove all search highlights
   * @private
   */
  removeAllHighlights() {
    try {
      if (!this.draftQuill) return;
      
      // Get the current content
      const content = this.draftQuill.getContents();
      
      // Remove all background formatting
      for (let i = 0; i < content.ops.length; i++) {
        const op = content.ops[i];
        if (op.attributes && (op.attributes.background === '#ffff00' || op.attributes.background === '#ffcc00')) {
          const length = op.insert.length;
          const index = this.draftQuill.getIndex(op);
          this.draftQuill.removeFormat(index, length);
        }
      }
    } catch (error) {
      console.error('Error removing highlights:', error);
    }
  }
  
  /**
   * Clear the current search
   * @private
   */
  clearSearch() {
    try {
      this.searchState.query = '';
      this.searchState.matches = [];
      this.searchState.currentMatchIndex = -1;
      
      // Update match count display
      const matchCount = document.getElementById('search-results-count');
      if (matchCount) {
        matchCount.textContent = '0 matches';
      }
      
      // Update navigation buttons
      this.updateSearchNavigationButtons();
      
      // Remove highlights
      this.removeAllHighlights();
    } catch (error) {
      console.error('Error clearing search:', error);
    }
  }
  
  /**
   * Update the search navigation buttons state
   * @private
   */
  updateSearchNavigationButtons() {
    try {
      const prevBtn = document.getElementById('prev-match-btn');
      const nextBtn = document.getElementById('next-match-btn');
      
      const hasMatches = this.searchState.matches.length > 0;
      
      if (prevBtn) prevBtn.disabled = !hasMatches;
      if (nextBtn) nextBtn.disabled = !hasMatches;
    } catch (error) {
      console.error('Error updating search navigation buttons:', error);
    }
  }
  
  /**
   * Handle replace operation
   * @private
   */
  handleReplace() {
    try {
      if (!this.draftQuill) return;
      
      const currentIndex = this.searchState.currentMatchIndex;
      if (currentIndex < 0 || currentIndex >= this.searchState.matches.length) {
        UIService.showNotification('No match selected for replacement', 'warning');
        return;
      }
      
      const replaceInput = document.getElementById('draft-replace');
      if (!replaceInput) return;
      
      const replacement = replaceInput.value;
      const match = this.searchState.matches[currentIndex];
      
      // Perform the replacement
      this.draftQuill.deleteText(match.index, match.length);
      this.draftQuill.insertText(match.index, replacement);
      
      // Re-run the search to update matches
      this.handleSearch();
      
      UIService.showNotification('Text replaced', 'success');
    } catch (error) {
      console.error('Error performing replace:', error);
      UIService.showNotification('Error performing replace', 'error');
    }
  }
  
  /**
   * Handle replace all operation
   * @private
   */
  handleReplaceAll() {
    try {
      if (!this.draftQuill) return;
      
      const searchInput = document.getElementById('draft-search');
      const replaceInput = document.getElementById('draft-replace');
      
      if (!searchInput || !replaceInput) return;
      
      const query = searchInput.value.trim();
      const replacement = replaceInput.value;
      
      if (query === '') {
        UIService.showNotification('Search term is empty', 'warning');
        return;
      }
      
      if (this.searchState.matches.length === 0) {
        UIService.showNotification('No matches found', 'warning');
        return;
      }
      
      // Get editor content
      const text = this.draftQuill.getText();
      
      // Create a new string with replacements
      const newText = text.replace(new RegExp(this.escapeRegExp(query), 'gi'), replacement);
      
      // Set the new content
      this.draftQuill.setText(newText);
      
      // Clear search
      this.clearSearch();
      
      UIService.showNotification(`Replaced all occurrences`, 'success');
    } catch (error) {
      console.error('Error performing replace all:', error);
      UIService.showNotification('Error performing replace all', 'error');
    }
  }
  
  /**
   * Handle title change
   * @private
   */
  async handleTitleChange() {
    try {
      if (!this.currentDraft) return;
      
      const titleInput = document.getElementById('draft-title');
      if (!titleInput) return;
      
      const newTitle = titleInput.value.trim();
      
      // Don't do anything if title didn't change
      if (newTitle === this.currentDraft.title) return;
      
      // Don't allow empty titles
      if (newTitle === '') {
        titleInput.value = this.currentDraft.title;
        UIService.showNotification('Draft title cannot be empty', 'warning');
        return;
      }
      
      // Update the draft
      this.currentDraft.title = newTitle;
      this.currentDraft.modified = new Date().toISOString();
      
      // Save to database
      await StorageService.saveItem('drafts', this.currentDraft);
      
      // Update list
      await this.renderDraftsList();
      
      UIService.showNotification('Draft title updated', 'success');
    } catch (error) {
      console.error('Error updating draft title:', error);
      UIService.showNotification('Error updating draft title', 'error');
    }
  }
  
  /**
   * Handle show history button click
   * @private
   */
  handleShowHistory() {
    try {
      if (!this.currentDraft) {
        UIService.showNotification('No draft selected', 'warning');
        return;
      }
      
      const historyModal = document.getElementById('draft-version-history-modal');
      const versionList = document.getElementById('version-list');
      
      if (!historyModal || !versionList) return;
      
      // Clear previous list
      versionList.innerHTML = '';
      
      // Get history for current draft
      const history = this.versionHistory.get(this.currentDraft.id) || [];
      
      if (history.length === 0) {
        versionList.innerHTML = '<p class="no-versions">No version history available</p>';
      } else {
        // Create list items for each version
        history.forEach((version, index) => {
          const date = new Date(version.timestamp);
          const formattedDate = date.toLocaleString();
          
          const versionItem = document.createElement('div');
          versionItem.className = 'version-item';
          versionItem.dataset.index = index;
          
          versionItem.innerHTML = `
            <div class="version-header">
              <input type="radio" name="version-select" id="version-${index}" ${index === 0 ? 'checked' : ''}>
              <label for="version-${index}">
                <span class="version-number">Version ${version.version}</span>
                <span class="version-date">${formattedDate}</span>
                <span class="version-word-count">${version.wordCount} words</span>
              </label>
            </div>
          `;
          
          versionList.appendChild(versionItem);
          
          // Add click handler
          versionItem.addEventListener('click', () => {
            // Select the radio button
            const radio = versionItem.querySelector('input[type="radio"]');
            if (radio) radio.checked = true;
            
            // Enable restore button
            const restoreBtn = document.getElementById('restore-version-btn');
            if (restoreBtn) restoreBtn.disabled = false;
          });
        });
      }
      
      // Disable restore button initially
      const restoreBtn = document.getElementById('restore-version-btn');
      if (restoreBtn) restoreBtn.disabled = true;
      
      // Show the modal
      historyModal.style.display = 'flex';
    } catch (error) {
      console.error('Error showing version history:', error);
      UIService.showNotification('Error showing version history', 'error');
    }
  }
  
  /**
   * Handle restore version button click
   * @private
   */
  async handleRestoreVersion() {
    try {
      // Find selected version
      const selectedRadio = document.querySelector('input[name="version-select"]:checked');
      if (!selectedRadio) return;
      
      const versionItem = selectedRadio.closest('.version-item');
      if (!versionItem) return;
      
      const index = parseInt(versionItem.dataset.index);
      const history = this.versionHistory.get(this.currentDraft.id) || [];
      
      if (index < 0 || index >= history.length) return;
      
      const version = history[index];
      
      // Ask for confirmation
      const confirmed = confirm(`Restore to version ${version.version}? This will overwrite current content.`);
      if (!confirmed) return;
      
      // Restore content
      if (this.draftQuill) {
        const content = JSON.parse(version.content);
        this.draftQuill.setContents(content);
      }
      
      // Update draft
      this.currentDraft.content = version.content;
      this.currentDraft.modified = new Date().toISOString();
      this.currentDraft.version = version.version;
      
      // Save to database
      await StorageService.saveItem('drafts', this.currentDraft);
      
      // Update UI
      this.updateDraftUI(this.currentDraft);
      
      // Close modal
      const historyModal = document.getElementById('draft-version-history-modal');
      if (historyModal) historyModal.style.display = 'none';
      
      UIService.showNotification(`Restored to version ${version.version}`, 'success');
    } catch (error) {
      console.error('Error restoring version:', error);
      UIService.showNotification('Error restoring version', 'error');
    }
  }
  
  /**
   * Handle preview draft button click
   * @private
   */
  handlePreviewDraft() {
    try {
      if (!this.currentDraft || !this.draftQuill) {
        UIService.showNotification('No draft to preview', 'warning');
        return;
      }
      
      // Get HTML content from Quill
      const html = this.draftQuill.root.innerHTML;
      
      // Update preview modal
      const previewTitle = document.getElementById('preview-title');
      const previewContent = document.getElementById('preview-content');
      const previewWordCount = document.getElementById('preview-word-count');
      const previewReadingTime = document.getElementById('preview-reading-time');
      
      if (previewTitle) previewTitle.textContent = this.currentDraft.title;
      if (previewContent) previewContent.innerHTML = html;
      
      const text = this.draftQuill.getText();
      const wordCount = TextService.countWords(text);
      const readingTime = TextService.estimateReadingTime(text);
      
      if (previewWordCount) previewWordCount.textContent = wordCount + ' words';
      if (previewReadingTime) previewReadingTime.textContent = readingTime + ' min read';
      
      // Show preview modal
      const previewModal = document.getElementById('draft-preview-modal');
      if (previewModal) previewModal.style.display = 'flex';
    } catch (error) {
      console.error('Error previewing draft:', error);
      UIService.showNotification('Error previewing draft', 'error');
    }
  }
  
  /**
   * Handle publish draft button click
   * @private
   */
  async handlePublishDraft() {
    try {
      if (!this.currentDraft) {
        UIService.showNotification('Please select a draft to publish', 'warning');
        return;
      }

      // Save any unsaved changes first
      if (this.hasUnsavedChanges()) {
        await this.saveDraft(false);
      }

      // Activate publish tab while maintaining the current draft
      UIService.activateSecondaryTab('drafts-publish');

      // Show notification to select platform
      UIService.showNotification('Please select a publishing platform', 'info');

      // Update UI to show platform selection is needed
      const platformGrid = document.getElementById('platform-grid');
      if (platformGrid) {
        platformGrid.style.display = 'grid';
      }

      // Enable platform selection toggle
      const platformToggle = document.getElementById('platform-selection-toggle');
      if (platformToggle) {
        platformToggle.checked = true;
        localStorage.setItem('showPlatformSelection', 'true');
      }

      // Highlight platform cards that are logged in
      const platformCards = document.querySelectorAll('.platform-card');
      platformCards.forEach(card => {
        const platform = card.dataset.platform;
        const isLoggedIn = publishingService.isLoggedIn(platform);
        card.classList.toggle('logged-in', isLoggedIn);
      });

      // Update platform settings to show current draft info
      const platformSettings = document.getElementById('platform-settings');
      if (platformSettings) {
        platformSettings.innerHTML = `
          <h3>Selected Draft: ${this.currentDraft.title}</h3>
          <p>Select a platform above to configure publishing settings</p>
        `;
      }
    } catch (error) {
      console.error('Error handling publish draft:', error);
      UIService.showNotification(`Error preparing to publish: ${error.message}`, 'error');
    }
  }
  
  /**
   * Handle platform selection in publish tab
   * @param {string} platform - The selected platform
   * @private
   */
  async handlePlatformSelection(platform) {
    try {
      if (!this.currentDraft) {
        UIService.showNotification('Please select a draft to publish', 'warning');
        return;
      }

      // Highlight selected platform card
      const platformCards = document.querySelectorAll('.platform-card');
      platformCards.forEach(card => {
        card.classList.remove('selected');
        if (card.dataset.platform === platform) {
          card.classList.add('selected');
        }
      });

      // Check if user is logged in to the platform
      const isLoggedIn = publishingService.isLoggedIn(platform);

      // Update platform settings UI
      const platformSettings = document.getElementById('platform-settings');
      if (platformSettings) {
        platformSettings.innerHTML = `
          <h3>${this.getPlatformDisplayName(platform)} Settings</h3>
          <div class="platform-actions">
            ${isLoggedIn ? `
              <button id="platform-logout-btn" class="secondary-btn">
                <i class="fas fa-sign-out-alt"></i> Logout
              </button>
              <button id="platform-publish-btn" class="primary-btn">
                <i class="fas fa-upload"></i> Publish
              </button>
            ` : `
              <button id="platform-login-btn" class="primary-btn">
                <i class="fas fa-sign-in-alt"></i> Login
              </button>
            `}
          </div>
          ${isLoggedIn ? `
            <div class="publish-options">
              <h4>Publishing Options</h4>
              ${await publishingService.getPublishOptionsHTML(platform)}
            </div>
          ` : ''}
        `;

        // Set up event listeners for the new buttons
        const loginBtn = document.getElementById('platform-login-btn');
        if (loginBtn) {
          loginBtn.addEventListener('click', () => this.handlePlatformLogin(platform));
        }

        const logoutBtn = document.getElementById('platform-logout-btn');
        if (logoutBtn) {
          logoutBtn.addEventListener('click', () => this.handlePlatformLogout(platform));
        }

        const publishBtn = document.getElementById('platform-publish-btn');
        if (publishBtn) {
          publishBtn.addEventListener('click', () => this.handlePlatformPublish(platform));
        }
      }

      // Show appropriate notification
      if (isLoggedIn) {
        UIService.showNotification(`Ready to publish to ${this.getPlatformDisplayName(platform)}`, 'info');
      } else {
        UIService.showNotification(`Please log in to ${this.getPlatformDisplayName(platform)}`, 'info');
      }
    } catch (error) {
      console.error('Error handling platform selection:', error);
      UIService.showNotification(`Error selecting platform: ${error.message}`, 'error');
    }
  }
  
  /**
   * Handle platform login
   * @param {string} platform - The platform to log in to
   * @private
   */
  async handlePlatformLogin(platform) {
    try {
      UIService.toggleLoading(true, `Logging in to ${this.getPlatformDisplayName(platform)}...`);
      
      const success = await publishingService.login(platform);
      
      if (success) {
        // Update UI to reflect logged-in state
        await this.handlePlatformSelection(platform);
        UIService.showNotification(`Successfully logged in to ${this.getPlatformDisplayName(platform)}`, 'success');
      } else {
        UIService.showNotification(`Failed to log in to ${this.getPlatformDisplayName(platform)}`, 'error');
      }
    } catch (error) {
      console.error('Error handling platform login:', error);
      UIService.showNotification(`Error logging in: ${error.message}`, 'error');
    } finally {
      UIService.toggleLoading(false);
    }
  }
  
  /**
   * Handle platform logout
   * @param {string} platform - The platform to log out from
   * @private
   */
  async handlePlatformLogout(platform) {
    try {
      UIService.toggleLoading(true, `Logging out from ${this.getPlatformDisplayName(platform)}...`);
      
      const success = await publishingService.logout(platform);
      
      if (success) {
        // Update UI to reflect logged-out state
        await this.handlePlatformSelection(platform);
        UIService.showNotification(`Successfully logged out from ${this.getPlatformDisplayName(platform)}`, 'success');
      } else {
        UIService.showNotification(`Failed to log out from ${this.getPlatformDisplayName(platform)}`, 'error');
      }
    } catch (error) {
      console.error('Error handling platform logout:', error);
      UIService.showNotification(`Error logging out: ${error.message}`, 'error');
    } finally {
      UIService.toggleLoading(false);
    }
  }
  
  /**
   * Handle platform publish button click
   * @param {string} platform - The platform to publish to
   * @private
   */
  async handlePlatformPublish(platform) {
    try {
      if (!this.currentDraft) {
        UIService.showNotification('Please select a draft to publish', 'warning');
        return;
      }

      // Check if user is logged in
      if (!publishingService.isLoggedIn(platform)) {
        UIService.showNotification(`Please log in to ${this.getPlatformDisplayName(platform)} first`, 'warning');
        return;
      }

      // Show scheduling modal
      this.showSchedulingModal(platform);
    } catch (error) {
      console.error('Error handling platform publish:', error);
      UIService.showNotification(`Error preparing to publish: ${error.message}`, 'error');
    }
  }
  
  /**
   * Show scheduling modal for publication
   * @param {string} platform - The platform to publish to
   * @private
   */
  async showSchedulingModal(platform) {
    try {
      const modal = document.getElementById('scheduling-modal');
      if (!modal) {
        throw new Error('Scheduling modal not found');
      }

      // Get platform-specific options
      const publishOptions = await publishingService.getPublishOptions(platform);

      // Update modal content with platform-specific options
      const optionsContainer = modal.querySelector('.publish-options');
      if (optionsContainer) {
        optionsContainer.innerHTML = publishOptions;
      }

      // Set up event listeners
      const scheduleToggle = modal.querySelector('#enable-scheduling');
      const dateTimeInputs = modal.querySelector('.scheduling-inputs');
      if (scheduleToggle && dateTimeInputs) {
        scheduleToggle.addEventListener('change', () => {
          dateTimeInputs.style.display = scheduleToggle.checked ? 'block' : 'none';
        });
      }

      // Set minimum date to today
      const dateInput = modal.querySelector('#publish-date');
      if (dateInput) {
        const today = new Date().toISOString().split('T')[0];
        dateInput.min = today;
        dateInput.value = today;
      }

      // Set default time to current time rounded to next hour
      const timeInput = modal.querySelector('#publish-time');
      if (timeInput) {
        const now = new Date();
        now.setHours(now.getHours() + 1);
        now.setMinutes(0);
        timeInput.value = now.toTimeString().slice(0, 5);
      }

      // Set up publish button
      const publishBtn = modal.querySelector('#modal-publish-btn');
      if (publishBtn) {
        publishBtn.addEventListener('click', async () => {
          try {
            UIService.toggleLoading(true, 'Publishing draft...');

            const scheduleEnabled = scheduleToggle.checked;
            const publishDate = dateInput.value;
            const publishTime = timeInput.value;
            const folderName = modal.querySelector('#folder-name').value;
            const updateStatus = modal.querySelector('#update-status').checked;

            // Get additional options from platform-specific fields
            const options = publishingService.getPublishOptionsValues(platform);

            const publishData = {
              draftId: this.currentDraft.id,
              platform,
              scheduled: scheduleEnabled,
              publishDateTime: scheduleEnabled ? `${publishDate}T${publishTime}` : null,
              folderName: folderName || null,
              updateStatus,
              ...options
            };

            const result = await publishingService.publish(publishData);

            if (result.success) {
              // Update draft status if requested
              if (updateStatus) {
                await this.updateDraftStatus(this.currentDraft.id, 'published');
              }

              // Update publishing history
              await this.updatePublishingHistory(platform, result.url);

              UIService.showNotification(
                scheduleEnabled ? 'Draft scheduled for publication' : 'Draft published successfully',
                'success'
              );

              // Close modal
              modal.style.display = 'none';
            } else {
              throw new Error(result.message || 'Failed to publish draft');
            }
          } catch (error) {
            console.error('Error publishing draft:', error);
            UIService.showNotification(`Error publishing draft: ${error.message}`, 'error');
          } finally {
            UIService.toggleLoading(false);
          }
        });
      }

      // Show modal
      modal.style.display = 'block';
    } catch (error) {
      console.error('Error showing scheduling modal:', error);
      UIService.showNotification(`Error showing scheduling modal: ${error.message}`, 'error');
    }
  }
  
  /**
   * Execute the publish/schedule operation
   * @param {string} platform - Platform ID or 'all' for all platforms
   * @private
   */
  async executePublish(platform) {
    try {
      // Import PublishingService
      const module = await import('./PublishingService.js');
      const PublishingService = module.default;
      
      // Get scheduling options
      const enableScheduling = document.getElementById('enable-scheduling').checked;
      
      // Get folder name
      const folderNameInput = document.getElementById('folder-name');
      const folderName = folderNameInput ? folderNameInput.value.trim() : '';
      
      // Get update status option
      const updateStatus = document.getElementById('update-draft-status').checked;
      
      // Publication options
      const options = {
        folderName,
        updateStatus
      };
      
      // Hide the modal
      const modal = document.getElementById('scheduling-modal');
      if (modal) {
        modal.style.display = 'none';
      }
      
      // If scheduling enabled, schedule instead of publishing now
      if (enableScheduling) {
        const dateInput = document.getElementById('scheduled-date');
        const timeInput = document.getElementById('scheduled-time');
        
        if (!dateInput || !timeInput) {
          UIService.showNotification('Missing date or time for scheduling', 'error');
          return;
        }
        
        const date = dateInput.value;
        const time = timeInput.value;
        
        if (!date || !time) {
          UIService.showNotification('Please enter a valid date and time', 'error');
          return;
        }
        
        // Parse the date/time as GMT+8
        const scheduled = new Date(`${date}T${time}:00+08:00`);
        
        // If the scheduled time is in the past, show error
        if (scheduled < new Date()) {
          UIService.showNotification('Scheduled time must be in the future', 'error');
          return;
        }
        
        // For "all" platform publishing, need to specify which platforms to include
        if (platform === 'all') {
          const loginStatus = PublishingService.getLoginStatus();
          options.selectedPlatforms = Object.keys(loginStatus).filter(p => loginStatus[p]);
          
          if (options.selectedPlatforms.length === 0) {
            UIService.showNotification('You are not logged in to any platforms', 'error');
            return;
          }
        }
        
        // Schedule the publication
        const result = await PublishingService.schedulePublication(platform, this.currentDraft, scheduled, options);
        
        if (result.success) {
          UIService.showNotification(result.message, 'success');
        } else {
          UIService.showNotification(result.message, 'error');
        }
      } else {
        // If publishing to all platforms
        if (platform === 'all') {
          const loginStatus = PublishingService.getLoginStatus();
          const platformsToPublish = Object.keys(loginStatus).filter(p => loginStatus[p]);
          
          if (platformsToPublish.length === 0) {
            UIService.showNotification('You are not logged in to any platforms', 'error');
            return;
          }
          
          let allSuccess = true;
          let draftUpdated = false;
          
          for (const p of platformsToPublish) {
            const result = await PublishingService.publish(p, this.currentDraft, options);
            
            if (!result.success) {
              allSuccess = false;
            }
            
            if (result.draftUpdated) {
              draftUpdated = true;
            }
          }
          
          if (allSuccess) {
            UIService.showNotification('Published successfully to all platforms', 'success');
          } else {
            UIService.showNotification('Publishing completed with some errors. Check publishing history for details.', 'warning');
          }
          
          // If draft status was updated, refresh UI
          if (draftUpdated) {
            this.updateDraftUI(this.currentDraft);
          }
        } else {
          // Publishing to a single platform
          const result = await PublishingService.publish(platform, this.currentDraft, options);
          
          if (result.success) {
            UIService.showNotification(result.message, 'success');
            
            // If draft status was updated, refresh UI
            if (result.draftUpdated) {
              this.updateDraftUI(this.currentDraft);
            }
          } else {
            UIService.showNotification(result.message, 'error');
          }
        }
      }
      
      // Refresh platform history
      this.updatePublishingHistory();
    } catch (error) {
      console.error('Error executing publish:', error);
      UIService.showNotification('Error publishing draft', 'error');
    }
  }
  
  /**
   * Handle "Publish to All Platforms" button click
   * @private
   */
  async handlePublishToAll() {
    try {
      if (!this.currentDraft) {
        UIService.showNotification('No draft to publish', 'warning');
        return;
      }
      
      // Import PublishingService to check login status
      const module = await import('./PublishingService.js');
      const PublishingService = module.default;
      
      const loginStatus = PublishingService.getLoginStatus();
      const loggedInPlatforms = Object.keys(loginStatus).filter(p => loginStatus[p]);
      
      if (loggedInPlatforms.length === 0) {
        UIService.showNotification('You are not logged in to any platforms', 'warning');
        return;
      }
      
      // Show the scheduling modal for all platforms
      this.showSchedulingModal('all');
    } catch (error) {
      console.error('Error handling publish to all:', error);
      UIService.showNotification('Error preparing multi-platform publish', 'error');
    }
  }
  
  /**
   * Show platform selection modal for multi-publish
   * @private
   */
  async showPlatformSelectionModal() {
    try {
      // Import PublishingService
      const module = await import('./PublishingService.js');
      const PublishingService = module.default;
      
      // Get login status
      const loginStatus = PublishingService.getLoginStatus();
      
      // Create the modal if it doesn't exist
      let modal = document.getElementById('platform-selection-modal');
      
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'platform-selection-modal';
        modal.className = 'modal';
        modal.innerHTML = `
          <div class="modal-content">
            <div class="modal-header">
              <h3><i class="fas fa-check-square"></i> Select Publishing Platforms</h3>
              <button class="modal-close-btn">×</button>
            </div>
            <div class="modal-body">
              <p>Select the platforms you want to publish to:</p>
              <div class="platform-checkboxes">
                ${Object.keys(loginStatus).map(platform => `
                  <label class="platform-checkbox ${!loginStatus[platform] ? 'disabled' : ''}">
                    <input type="checkbox" name="selected-platform" value="${platform}" ${loginStatus[platform] ? '' : 'disabled'} ${loginStatus[platform] ? 'checked' : ''}>
                    <span class="platform-name">
                      <i class="fas fa-${PublishingService.platformInfo[platform].icon}"></i>
                      ${PublishingService.platformInfo[platform].name}
                    </span>
                    <span class="platform-status">
                      ${loginStatus[platform] ? 
                        '<i class="fas fa-check-circle text-success"></i> Logged In' : 
                        '<i class="fas fa-times-circle text-danger"></i> Not Logged In'}
                    </span>
                  </label>
                `).join('')}
              </div>
            </div>
            <div class="modal-footer">
              <button id="confirm-platform-selection-btn" class="primary-btn">
                <i class="fas fa-check"></i> Confirm Selection
              </button>
              <button id="cancel-platform-selection-btn" class="secondary-btn">
                <i class="fas fa-times"></i> Cancel
              </button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);
        
        // Add event listeners
        const closeBtn = modal.querySelector('.modal-close-btn');
        if (closeBtn) {
          closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
          });
        }
        
        const cancelBtn = document.getElementById('cancel-platform-selection-btn');
        if (cancelBtn) {
          cancelBtn.addEventListener('click', () => {
            modal.style.display = 'none';
          });
        }
      } else {
        // Update the checkboxes if the modal already exists
        const checkboxContainer = modal.querySelector('.platform-checkboxes');
        if (checkboxContainer) {
          checkboxContainer.innerHTML = Object.keys(loginStatus).map(platform => `
            <label class="platform-checkbox ${!loginStatus[platform] ? 'disabled' : ''}">
              <input type="checkbox" name="selected-platform" value="${platform}" ${loginStatus[platform] ? '' : 'disabled'} ${loginStatus[platform] ? 'checked' : ''}>
              <span class="platform-name">
                <i class="fas fa-${PublishingService.platformInfo[platform].icon}"></i>
                ${PublishingService.platformInfo[platform].name}
              </span>
              <span class="platform-status">
                ${loginStatus[platform] ? 
                  '<i class="fas fa-check-circle text-success"></i> Logged In' : 
                  '<i class="fas fa-times-circle text-danger"></i> Not Logged In'}
              </span>
            </label>
          `).join('');
        }
      }
      
      // Update the confirm button handler
      const confirmBtn = document.getElementById('confirm-platform-selection-btn');
      if (confirmBtn) {
        // Remove existing event listeners
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
        
        // Add new event listener
        newConfirmBtn.addEventListener('click', () => {
          // Get selected platforms
          const selectedPlatforms = Array.from(
            document.querySelectorAll('input[name="selected-platform"]:checked')
          ).map(checkbox => checkbox.value);
          
          // Hide the modal
          modal.style.display = 'none';
          
          // Continue with publishing using selected platforms
          this.continueMultiPublishWithSelection(selectedPlatforms);
        });
      }
      
      // Show the modal
      modal.style.display = 'flex';
    } catch (error) {
      console.error('Error showing platform selection modal:', error);
      UIService.showNotification('Error showing platform selection', 'error');
    }
  }
  
  /**
   * Continue with multi-platform publishing after selection
   * @param {Array<string>} selectedPlatforms - Selected platform IDs
   * @private
   */
  async continueMultiPublishWithSelection(selectedPlatforms) {
    try {
      if (!selectedPlatforms || selectedPlatforms.length === 0) {
        UIService.showNotification('No platforms selected for publishing', 'warning');
        return;
      }
      
      // Store selected platforms in data attribute for use in scheduling modal
      document.getElementById('publish-all-btn').setAttribute('data-selected-platforms', JSON.stringify(selectedPlatforms));
      
      // Show the scheduling modal
      this.showSchedulingModal('all');
    } catch (error) {
      console.error('Error continuing multi-publish:', error);
      UIService.showNotification('Error preparing multi-platform publish', 'error');
    }
  }
  
  /**
   * Update the publishing history display
   * @private
   */
  async updatePublishingHistory() {
    try {
      if (!this.currentDraft) return;
      
      const historyContainer = document.getElementById('publish-history-list');
      if (!historyContainer) return;
      
      const publishHistory = this.currentDraft.publishHistory || [];
      
      if (publishHistory.length === 0) {
        historyContainer.innerHTML = '<p>No publishing history available</p>';
        return;
      }
      
      // Sort by timestamp (newest first)
      publishHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      // Generate HTML for each history item
      const historyHTML = publishHistory.map(item => {
        const date = new Date(item.timestamp).toLocaleString();
        let statusHTML = '';
        
        switch (item.status) {
          case 'published':
            statusHTML = '<span class="status-badge published">Published</span>';
            break;
          case 'scheduled':
            const scheduledDate = item.scheduledTime ? new Date(item.scheduledTime).toLocaleString() : 'Unknown';
            statusHTML = `<span class="status-badge scheduled">Scheduled for ${scheduledDate}</span>`;
            break;
          case 'cancelled':
            statusHTML = '<span class="status-badge cancelled">Cancelled</span>';
            break;
          case 'failed':
            statusHTML = '<span class="status-badge failed">Failed</span>';
            break;
          default:
            statusHTML = `<span class="status-badge">${item.status}</span>`;
        }
        
        return `
          <div class="history-item">
            <div class="history-item-header">
              <span class="history-platform">
                <i class="fas fa-${this.getPlatformIcon(item.platform)}"></i>
                ${this.getPlatformDisplayName(item.platform)}
              </span>
              <span class="history-date">${date}</span>
            </div>
            <div class="history-item-body">
              <div class="history-status">${statusHTML}</div>
              <div class="history-message">${item.message || ''}</div>
            </div>
          </div>
        `;
      }).join('');
      
      historyContainer.innerHTML = historyHTML;
    } catch (error) {
      console.error('Error updating publishing history:', error);
    }
  }
  
  /**
   * Get platform icon class
   * @param {string} platform - Platform ID
   * @returns {string} Icon class
   * @private
   */
  getPlatformIcon(platform) {
    const icons = {
      webnovel: 'book-open',
      scribblehub: 'pen-fancy',
      fanfiction: 'fan',
      ao3: 'archive',
      questionablequesting: 'question-circle',
      custom: 'code',
      'Multiple Platforms': 'globe'
    };
    
    return icons[platform] || 'globe';
  }
  
  /**
   * Get platform display name
   * @param {string} platform - Platform ID
   * @returns {string} Display name
   * @private
   */
  getPlatformDisplayName(platform) {
    const names = {
      webnovel: 'Webnovel',
      scribblehub: 'ScribbleHub',
      fanfiction: 'FanFiction.net',
      ao3: 'Archive of Our Own',
      questionablequesting: 'Questionable Questing',
      custom: 'Custom HTML',
      'Multiple Platforms': 'Multiple Platforms'
    };
    
    return names[platform] || platform;
  }
  
  /**
   * Load drafts for a project
   * @param {string} projectId - Project ID
   * @returns {Promise<Array<Object>>} Array of drafts
   */
  async loadDraftsForProject(projectId) {
    try {
      // Get drafts for this project
      const drafts = await StorageService.getByIndex('drafts', 'projectId', projectId);
      
      // Render the drafts list
      await this.renderDraftsList(drafts);
      
      return drafts;
    } catch (error) {
      console.error('Error loading drafts for project:', error);
      UIService.showNotification('Error loading drafts', 'error');
      return [];
    }
  }
  
  /**
   * Render the drafts list in the UI
   * @param {Array<Object>} drafts - Array of drafts to display
   * @returns {Promise<void>}
   */
  async renderDraftsList(drafts = null) {
    try {
      const listContainer = document.getElementById('drafts-list-body');
      if (!listContainer) {
        console.warn('Drafts list container not found');
        return;
      }
      
      // If drafts not provided, load for current project
      if (!drafts) {
        const currentProject = ProjectService.getCurrentProject();
        if (currentProject) {
          drafts = await StorageService.getByIndex('drafts', 'projectId', currentProject.id);
        } else {
          drafts = [];
        }
      }
      
      // Sort drafts by modified date (most recent first)
      drafts.sort((a, b) => new Date(b.modified) - new Date(a.modified));
      
      // Clear the list
      listContainer.innerHTML = '';
      
      if (drafts.length === 0) {
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = `
          <td colspan="7" class="empty-state">
            <p>No drafts yet</p>
            <p>Create a new draft or import from translation</p>
          </td>
        `;
        listContainer.appendChild(emptyRow);
        return;
      }
      
      // Add each draft to the list
      drafts.forEach(draft => {
        const row = document.createElement('tr');
        row.dataset.id = draft.id;
        
        if (this.currentDraft && this.currentDraft.id === draft.id) {
          row.classList.add('active');
        }
        
        const modifiedDate = new Date(draft.modified).toLocaleDateString();
        const modifiedTime = new Date(draft.modified).toLocaleTimeString();
        
        row.innerHTML = `
          <td>
            <input type="checkbox" class="draft-select" data-id="${draft.id}">
          </td>
          <td>${draft.title}</td>
          <td><span class="status-badge ${draft.status}">${draft.status}</span></td>
          <td title="${modifiedDate} ${modifiedTime}">${modifiedDate}</td>
          <td>${draft.wordCount || 0}</td>
          <td>${this.renderTags(draft.tags || [])}</td>
          <td>
            <button class="small-btn edit-draft-btn" title="Edit draft" data-id="${draft.id}">
              <i class="fas fa-edit"></i>
            </button>
            <button class="small-btn delete-draft-btn" title="Delete draft" data-id="${draft.id}">
              <i class="fas fa-trash-alt"></i>
            </button>
          </td>
        `;
        
        listContainer.appendChild(row);
        
        // Add event listeners for the edit and delete buttons
        const editBtn = row.querySelector('.edit-draft-btn');
        if (editBtn) {
          editBtn.addEventListener('click', () => {
            this.handleEditDraft(draft.id);
          });
        }
        
        const deleteBtn = row.querySelector('.delete-draft-btn');
        if (deleteBtn) {
          deleteBtn.addEventListener('click', () => {
            this.handleDeleteDraft(draft.id);
          });
        }
        
        // Add row click handler to select the draft
        row.addEventListener('click', (e) => {
          // Ignore if clicking on buttons or checkbox
          if (
            e.target.tagName === 'BUTTON' || 
            e.target.tagName === 'I' || 
            e.target.tagName === 'INPUT'
          ) {
            return;
          }
          
          this.handleEditDraft(draft.id);
        });
      });
      
      // Update the "selected drafts" count
      this.updateSelectedDraftsCount();
    } catch (error) {
      console.error('Error rendering drafts list:', error);
      UIService.showNotification('Error displaying drafts', 'error');
    }
  }
  
  /**
   * Render tags for a draft
   * @param {Array<string>} tags - Array of tags
   * @returns {string} HTML for tags
   * @private
   */
  renderTags(tags) {
    if (!tags || tags.length === 0) {
      return '<span class="no-tags">No tags</span>';
    }
    
    return tags.map(tag => 
      `<span class="tag-badge">${tag}</span>`
    ).join('');
  }
  
  /**
   * Handle edit draft button click
   * @param {string} draftId - Draft ID
   * @private
   */
  async handleEditDraft(draftId) {
    try {
      // Switch to the editor tab
      UIService.activateSecondaryTab('drafts-editor');
      
      // Set the current draft
      await this.setCurrentDraft(draftId);
    } catch (error) {
      console.error('Error editing draft:', error);
      UIService.showNotification('Error loading draft', 'error');
    }
  }
  
  /**
   * Handle delete draft button click
   * @param {string} draftId - Draft ID
   * @private
   */
  async handleDeleteDraft(draftId) {
    try {
      const draft = await StorageService.getItem('drafts', draftId);
      if (!draft) return;
      
      // Confirm deletion
      const confirmed = confirm(`Are you sure you want to delete draft "${draft.title}"?`);
      if (!confirmed) return;
      
      // Delete the draft
      await StorageService.deleteItem('drafts', draftId);
      
      // If this was the current draft, clear it
      if (this.currentDraft && this.currentDraft.id === draftId) {
        this.currentDraft = null;
        
        // Clear editor
        if (this.draftQuill) {
          this.draftQuill.setText('');
        }
        
        // Clear draft title
        const titleInput = document.getElementById('draft-title');
        if (titleInput) titleInput.value = '';
        
        // Update status badge
        const statusBadge = document.getElementById('draft-status');
        if (statusBadge) {
          statusBadge.textContent = 'No Draft';
          statusBadge.className = 'draft-status-badge';
        }
        
        // Update last saved
        const lastSaved = document.getElementById('draft-last-saved');
        if (lastSaved) lastSaved.textContent = 'Last saved: Never';
      }
      
      // Remove from version history
      this.versionHistory.delete(draftId);
      
      // Update the list
      await this.renderDraftsList();
      
      UIService.showNotification(`Draft "${draft.title}" deleted`, 'success');
    } catch (error) {
      console.error('Error deleting draft:', error);
      UIService.showNotification('Error deleting draft', 'error');
    }
  }
  
  /**
   * Apply filters to drafts list
   * @private
   */
  async applyDraftFilters() {
    try {
      // Get current project
      const currentProject = ProjectService.getCurrentProject();
      if (!currentProject) return;
      
      // Get all drafts for the project
      let drafts = await StorageService.getByIndex('drafts', 'projectId', currentProject.id);
      
      // Apply status filter
      const statusFilter = document.getElementById('draft-status-filter');
      if (statusFilter && statusFilter.value !== 'all') {
        drafts = drafts.filter(draft => draft.status === statusFilter.value);
      }
      
      // Apply sorting
      const sortBy = document.getElementById('draft-sort-by');
      if (sortBy) {
        switch (sortBy.value) {
          case 'title':
            drafts.sort((a, b) => a.title.localeCompare(b.title));
            break;
          case 'created':
            drafts.sort((a, b) => new Date(b.created) - new Date(a.created));
            break;
          case 'modified':
          default:
            drafts.sort((a, b) => new Date(b.modified) - new Date(a.modified));
            break;
        }
      }
      
      // Update the list
      await this.renderDraftsList(drafts);
    } catch (error) {
      console.error('Error applying filters:', error);
      UIService.showNotification('Error filtering drafts', 'error');
    }
  }
  
  /**
   * Handle selecting all drafts
   * @param {Event} event - Change event
   * @private
   */
  handleSelectAllDrafts(event) {
    try {
      const isChecked = event.target.checked;
      
      // Select/deselect all checkboxes
      const checkboxes = document.querySelectorAll('.draft-select');
      checkboxes.forEach(checkbox => {
        checkbox.checked = isChecked;
      });
      
      // Update the selected count
      this.updateSelectedDraftsCount();
    } catch (error) {
      console.error('Error selecting all drafts:', error);
    }
  }
  
  /**
   * Update the count of selected drafts
   * @private
   */
  updateSelectedDraftsCount() {
    try {
      const selectedCheckboxes = document.querySelectorAll('.draft-select:checked');
      const count = selectedCheckboxes.length;
      
      // Update count display
      const countEl = document.getElementById('selected-drafts-count');
      if (countEl) countEl.textContent = `${count} selected`;
      
      // Enable/disable batch action buttons
      const deleteBtn = document.getElementById('delete-selected-drafts');
      const exportBtn = document.getElementById('export-selected-drafts');
      
      if (deleteBtn) deleteBtn.disabled = count === 0;
      if (exportBtn) exportBtn.disabled = count === 0;
    } catch (error) {
      console.error('Error updating selected count:', error);
    }
  }
  
  /**
   * Handle deleting selected drafts
   * @private
   */
  async handleDeleteSelectedDrafts() {
    try {
      const selectedCheckboxes = document.querySelectorAll('.draft-select:checked');
      const count = selectedCheckboxes.length;
      
      if (count === 0) return;
      
      // Confirm deletion
      const confirmed = confirm(`Are you sure you want to delete ${count} selected draft(s)?`);
      if (!confirmed) return;
      
      UIService.toggleLoading(true, `Deleting ${count} drafts...`);
      
      // Collect IDs
      const draftIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.id);
      
      // Delete each draft
      const deletePromises = draftIds.map(async id => {
        await StorageService.deleteItem('drafts', id);
        
        // If this was the current draft, clear it
        if (this.currentDraft && this.currentDraft.id === id) {
          this.currentDraft = null;
          
          // Clear editor
          if (this.draftQuill) {
            this.draftQuill.setText('');
          }
          
          // Clear draft title
          const titleInput = document.getElementById('draft-title');
          if (titleInput) titleInput.value = '';
        }
        
        // Remove from version history
        this.versionHistory.delete(id);
      });
      
      await Promise.all(deletePromises);
      
      // Update the list
      await this.renderDraftsList();
      
      UIService.toggleLoading(false);
      UIService.showNotification(`${count} drafts deleted`, 'success');
    } catch (error) {
      console.error('Error deleting selected drafts:', error);
      UIService.toggleLoading(false);
      UIService.showNotification('Error deleting drafts', 'error');
    }
  }
  
  /**
   * Handle exporting selected drafts
   * @private
   */
  async handleExportSelectedDrafts() {
    try {
      const selectedCheckboxes = document.querySelectorAll('.draft-select:checked');
      const count = selectedCheckboxes.length;
      
      if (count === 0) return;
      
      UIService.toggleLoading(true, `Exporting ${count} drafts...`);
      
      // Collect IDs
      const draftIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.id);
      
      // Load each draft
      const drafts = [];
      for (const id of draftIds) {
        const draft = await StorageService.getItem('drafts', id);
        if (draft) drafts.push(draft);
      }
      
      // Create export JSON
      const exportData = {
        exportedAt: new Date().toISOString(),
        drafts: drafts,
        source: 'QuillSync AI'
      };
      
      const json = JSON.stringify(exportData, null, 2);
      
      // Create download link
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quillsync_drafts_export_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      UIService.toggleLoading(false);
      UIService.showNotification(`${count} drafts exported`, 'success');
    } catch (error) {
      console.error('Error exporting selected drafts:', error);
      UIService.toggleLoading(false);
      UIService.showNotification('Error exporting drafts', 'error');
    }
  }
  
  /**
   * Handle importing from translation
   * @private
   */
  async handleImportFromTranslation() {
    try {
      // Get the current project
      const currentProject = ProjectService.getCurrentProject();
      if (!currentProject) {
        UIService.showNotification('No project selected', 'warning');
        return;
      }
      
      // Get main Quill content from UIService
      const mainQuill = UIService.getQuill();
      if (!mainQuill) {
        UIService.showNotification('No translation content to import', 'warning');
        return;
      }
      
      const translationContent = mainQuill.getContents();
      
      // If empty, show warning
      if (mainQuill.getText().trim() === '') {
        UIService.showNotification('Translation content is empty', 'warning');
        return;
      }
      
      UIService.toggleLoading(true, 'Importing from translation...');
      
      // Confirm import
      const confirmed = confirm('Import current translation to a new draft?');
      if (!confirmed) {
        UIService.toggleLoading(false);
        return;
      }
      
      // Create a new draft
      const draft = await this.createDraft('Imported from Translation');
      
      // Set content
      draft.content = JSON.stringify(translationContent);
      
      // Update word count
      draft.wordCount = TextService.countWords(mainQuill.getText());
      
      // Save changes
      await StorageService.saveItem('drafts', draft);
      
      // Set as current draft
      await this.setCurrentDraft(draft.id);
      
      // Switch to editor tab
      UIService.activateSecondaryTab('drafts-editor');
      
      // Switch to drafts tab if not already there
      const draftsTab = document.querySelector('.tab-btn[data-tab="drafts"]');
      if (!draftsTab.classList.contains('active')) {
        UIService.activateTab('drafts');
      }
      
      // Update the list
      await this.renderDraftsList();
      
      UIService.toggleLoading(false);
      UIService.showNotification('Translation imported to draft', 'success');
    } catch (error) {
      console.error('Error importing from translation:', error);
      UIService.toggleLoading(false);
      UIService.showNotification('Error importing from translation', 'error');
    }
  }
  
  /**
   * Delete drafts for a project
   * @param {string} projectId - Project ID
   * @returns {Promise<void>}
   */
  async deleteDraftsForProject(projectId) {
    try {
      // Get all drafts for this project
      const drafts = await StorageService.getByIndex('drafts', 'projectId', projectId);
      
      // Delete each draft
      const deletePromises = drafts.map(async draft => {
        await StorageService.deleteItem('drafts', draft.id);
        
        // Clear from version history
        this.versionHistory.delete(draft.id);
      });
      
      await Promise.all(deletePromises);
      
      // If current draft was from this project, clear it
      if (this.currentDraft && this.currentDraft.projectId === projectId) {
        this.currentDraft = null;
        
        // Clear editor
        if (this.draftQuill) {
          this.draftQuill.setText('');
        }
        
        // Clear draft title
        const titleInput = document.getElementById('draft-title');
        if (titleInput) titleInput.value = '';
      }
      
      console.log(`Deleted ${drafts.length} drafts for project ${projectId}`);
    } catch (error) {
      console.error('Error deleting drafts for project:', error);
      throw error;
    }
  }
  
  /**
   * Escape special characters for use in RegExp
   * @param {string} string - String to escape
   * @returns {string} Escaped string
   * @private
   */
  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

// Create a singleton instance
const draftService = new DraftService();

// Export the singleton as default export
export default draftService;

// Also export class for testing or extending
export { DraftService };
