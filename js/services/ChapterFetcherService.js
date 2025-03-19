/**
 * ChapterFetcherService.js - Module for fetching and managing chapters from websites
 * Refactored with correct import paths
 */

// Fix import paths to use the correct relative paths
import StorageService from '../core/StorageService.js';
import UIService from '../core/UIService.js';
import ProjectService from './ProjectService.js';

/**
 * Class for fetching and managing chapters from supported websites
 */
class ChapterFetcherService {
  /**
   * Create a new ChapterFetcherService instance
   */
  constructor() {
    // Cache for website configurations
    this.websiteConfigsCache = null;
  }
  
  /**
   * Initialize the chapter fetcher service
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      console.log('Initializing ChapterFetcherService');
      
      // Set up event handlers
      this._setupEventHandlers();
      
      // Set up website configuration UI
      this._initializeWebsiteConfigUI();
      
      // Initialize chapter library UI
      this._initializeChapterLibraryUI();
      
      console.log('ChapterFetcherService initialized successfully');
      return Promise.resolve();
    } catch (error) {
      console.error('Error initializing chapter fetcher service:', error);
      return Promise.reject(error);
    }
  }
  /**
   * Set up all event handlers
   * @private
   */
  _setupEventHandlers() {
    const fetchChapterBtn = document.getElementById('fetch-chapter-btn');
    if (fetchChapterBtn) {
      fetchChapterBtn.addEventListener('click', this.handleFetchButtonClick.bind(this));
    }
    
    const prevChapterBtn = document.getElementById('prev-chapter-btn');
    if (prevChapterBtn) {
      prevChapterBtn.addEventListener('click', this.handlePrevChapterClick.bind(this));
    }
    
    const nextChapterBtn = document.getElementById('next-chapter-btn');
    if (nextChapterBtn) {
      nextChapterBtn.addEventListener('click', this.handleNextChapterClick.bind(this));
    }
    
    const copyChapterBtn = document.getElementById('copy-chapter-btn');
    if (copyChapterBtn) {
      copyChapterBtn.addEventListener('click', this.handleCopyButtonClick.bind(this));
    }
    
    const clearChapterBtn = document.getElementById('clear-chapter-btn');
    if (clearChapterBtn) {
      clearChapterBtn.addEventListener('click', this.handleClearButtonClick.bind(this));
    }
    
    const importToInputBtn = document.getElementById('import-to-input-btn');
    if (importToInputBtn) {
      importToInputBtn.addEventListener('click', this.handleImportToInputClick.bind(this));
    }
    
    const translateAllBtn = document.getElementById('translate-all-btn');
    if (translateAllBtn) {
      translateAllBtn.addEventListener('click', this.handleTranslateAllClick.bind(this));
    }
  }
  
  /**
   * Initialize website configuration UI
   * @private
   */
  _initializeWebsiteConfigUI() {
    try {
      // Set up add website button
      const addWebsiteBtn = document.getElementById('add-website-btn');
      if (addWebsiteBtn) {
        addWebsiteBtn.addEventListener('click', () => {
          // Clear form
          document.getElementById('website-name').value = '';
          document.getElementById('website-base-url').value = '';
          document.getElementById('website-url-pattern').value = '';
          document.getElementById('website-chapter-content').value = '';
          document.getElementById('website-chapter-title').value = '';
          document.getElementById('website-prev-chapter').value = '';
          document.getElementById('website-next-chapter').value = '';
          
          // Show modal
          document.getElementById('add-website-modal').style.display = 'flex';
        });
      }
      
      // Set up save website button
      const saveWebsiteBtn = document.getElementById('save-website-btn');
      if (saveWebsiteBtn) {
        saveWebsiteBtn.addEventListener('click', this.handleSaveWebsiteClick.bind(this));
      }
      
      // Set up test website configuration button
      const testWebsiteConfigBtn = document.getElementById('test-website-config-btn');
      if (testWebsiteConfigBtn) {
        testWebsiteConfigBtn.addEventListener('click', this.handleTestWebsiteConfigClick.bind(this));
      }
      
      // Initialize website list
      this.renderWebsiteList();
    } catch (error) {
      console.error('Error initializing website config UI:', error);
    }
  }
  
  /**
   * Initialize chapter library UI
   * @private
   */
  _initializeChapterLibraryUI() {
    try {
      // Set up tab change handler to refresh chapter library
      const chapterLibraryTab = document.querySelector('.secondary-tab-btn[data-tab="chapter-library"]');
      if (chapterLibraryTab) {
        chapterLibraryTab.addEventListener('click', () => {
          const currentProject = ProjectService.getCurrentProject();
          if (currentProject) {
            this.renderChapterLibrary(currentProject.id);
          }
        });
      }
      
      // Set up search
      const chapterSearch = document.getElementById('chapter-search');
      if (chapterSearch) {
        chapterSearch.addEventListener('input', this.handleChapterSearchInput.bind(this));
      }
      
      // Set up select all checkbox
      const selectAllChapters = document.getElementById('select-all-chapters');
      if (selectAllChapters) {
        selectAllChapters.addEventListener('change', this.handleSelectAllChaptersChange.bind(this));
      }
      
      // Set up delete selected button
      const deleteSelectedChapters = document.getElementById('delete-selected-chapters');
      if (deleteSelectedChapters) {
        deleteSelectedChapters.addEventListener('click', this.handleDeleteSelectedChaptersClick.bind(this));
      }
    } catch (error) {
      console.error('Error initializing chapter library UI:', error);
    }
  }
  
  /**
   * Handle fetch chapter button click
   * @private
   */
  handleFetchButtonClick() {
    const currentProject = ProjectService.getCurrentProject();
    if (!currentProject) {
      UIService.showNotification('Please select a project first', 'warning');
      return;
    }
    
    const url = document.getElementById('chapter-url')?.value.trim();
    if (!url) {
      UIService.showNotification('Please enter a chapter URL', 'warning');
      return;
    }
    
    const count = parseInt(document.getElementById('chapter-count')?.value) || 1;
    
    this.fetchChapter(url, count);
  }
  
  /**
   * Handle previous chapter button click
   * @private
   */
  handlePrevChapterClick() {
    const currentProject = ProjectService.getCurrentProject();
    if (!currentProject || !currentProject.currentChapter?.prevLink) return;
    
    const url = currentProject.currentChapter.prevLink;
    const urlInput = document.getElementById('chapter-url');
    if (urlInput) urlInput.value = url;
    
    this.fetchChapter(url);
  }
  
  /**
   * Handle next chapter button click
   * @private
   */
  handleNextChapterClick() {
    const currentProject = ProjectService.getCurrentProject();
    if (!currentProject || !currentProject.currentChapter?.nextLink) return;
    
    const url = currentProject.currentChapter.nextLink;
    const urlInput = document.getElementById('chapter-url');
    if (urlInput) urlInput.value = url;
    
    this.fetchChapter(url);
  }
  
  /**
   * Handle copy chapter button click
   * @private
   */
  handleCopyButtonClick() {
    const text = document.getElementById('chapter-text')?.value;
    if (!text) {
      UIService.showNotification('No chapter text to copy', 'warning');
      return;
    }
    
    navigator.clipboard.writeText(text)
      .then(() => {
        UIService.showNotification('Chapter text copied to clipboard', 'success');
        UIService.updateLastAction('Chapter text copied');
      })
      .catch(error => {
        UIService.showNotification(`Failed to copy: ${error.message}`, 'error');
      });
  }
  
  /**
   * Handle clear chapter button click
   * @private
   */
  handleClearButtonClick() {
    if (!confirm('Are you sure you want to clear the chapter text?')) return;
    
    const chapterText = document.getElementById('chapter-text');
    const chapterName = document.getElementById('chapter-name');
    
    if (chapterText) chapterText.value = '';
    if (chapterName) chapterName.textContent = 'No chapter selected';
    
    const currentProject = ProjectService.getCurrentProject();
    if (currentProject) {
      currentProject.currentChapter = { url: '', prevLink: '', nextLink: '' };
      currentProject.currentChapterName = '';
      ProjectService.updateProject(currentProject);
    }
    
    const prevChapterBtn = document.getElementById('prev-chapter-btn');
    const nextChapterBtn = document.getElementById('next-chapter-btn');
    
    if (prevChapterBtn) prevChapterBtn.disabled = true;
    if (nextChapterBtn) nextChapterBtn.disabled = true;
    
    UIService.updateWordCounts();
    UIService.updateLastAction('Chapter cleared');
  }
  
  /**
   * Handle import to input button click
   * @private
   */
  handleImportToInputClick() {
    const currentProject = ProjectService.getCurrentProject();
    if (!currentProject) {
      UIService.showNotification('Please select a project first', 'warning');
      return;
    }
    
    const text = document.getElementById('chapter-text')?.value;
    if (!text) {
      UIService.showNotification('No chapter text to import', 'warning');
      return;
    }
    
    const inputText = document.getElementById('input-text');
    if (inputText) inputText.value = text;
    
    ProjectService.updateProjectInput(currentProject.id, text)
      .then(() => {
        UIService.updateWordCounts();
        UIService.showNotification('Chapter text imported to input area', 'success');
        UIService.updateLastAction('Chapter imported to input');
        
        // Switch to translator tab
        UIService.activateTab('translator');
      })
      .catch(error => {
        console.error('Error updating project input:', error);
        UIService.showNotification(`Error importing chapter: ${error.message}`, 'error');
      });
  }
  
  /**
   * Handle translate all button click
   * @private
   */
  async handleTranslateAllClick() {
    const currentProject = ProjectService.getCurrentProject();
    if (!currentProject) {
      UIService.showNotification('Please select a project first', 'warning');
      return;
    }
    
    const text = document.getElementById('chapter-text')?.value.trim();
    if (!text) {
      UIService.showNotification('No chapter text to translate', 'warning');
      return;
    }
    
    // Check which translation method to use
    if (currentProject.settings?.translationMethod === 'openrouter') {
      // Use OpenRouter
      try {
        // Dynamically import to avoid circular dependencies
        const { default: OpenRouterService } = await import('./OpenRouterService.js');
        OpenRouterService.translateChineseText(text, currentProject);
      } catch (error) {
        UIService.showNotification(`OpenRouter service not available: ${error.message}`, 'error');
      }
    } else {
      // Use ChatGPT
      try {
        // Dynamically import to avoid circular dependencies
        const { default: ChatGPTService } = await import('./ChatGPTService.js');
        ChatGPTService.translateText(text);
      } catch (error) {
        UIService.showNotification(`ChatGPT service not available: ${error.message}`, 'error');
      }
    }
    
    UIService.updateLastAction('Chapter translation started');
  }
  
  /**
   * Handle save website click
   * @private
   */
  handleSaveWebsiteClick() {
    const name = document.getElementById('website-name')?.value.trim();
    const baseUrl = document.getElementById('website-base-url')?.value.trim();
    const urlPattern = document.getElementById('website-url-pattern')?.value.trim();
    const chapterContent = document.getElementById('website-chapter-content')?.value.trim();
    const chapterTitle = document.getElementById('website-chapter-title')?.value.trim();
    const prevChapter = document.getElementById('website-prev-chapter')?.value.trim();
    const nextChapter = document.getElementById('website-next-chapter')?.value.trim();
    
    if (!name || !baseUrl || !urlPattern || !chapterContent || !chapterTitle) {
      UIService.showNotification('Name, base URL, URL pattern, content selector, and title selector are required', 'warning');
      return;
    }
    
    const addWebsiteModal = document.getElementById('add-website-modal');
    const configId = addWebsiteModal ? addWebsiteModal.dataset.configId : null;
    
    try {
      const config = {
        id: configId || StorageService.generateUUID(),
        name: name,
        baseUrl: baseUrl,
        urlPattern: urlPattern,
        selectors: {
          chapterContent: chapterContent,
          chapterTitle: chapterTitle,
          prevChapter: prevChapter,
          nextChapter: nextChapter
        },
        isActive: true
      };
      
      if (configId) {
        this.updateWebsiteConfiguration(config)
          .then(() => {
            UIService.showNotification('Website configuration updated', 'success');
            if (addWebsiteModal) addWebsiteModal.style.display = 'none';
            this.renderWebsiteList();
            UIService.updateLastAction('Website config updated');
          })
          .catch(error => {
            console.error('Error updating website configuration:', error);
            UIService.showNotification(`Failed to update: ${error.message}`, 'error');
          });
      } else {
        this.addWebsiteConfiguration(config)
          .then(() => {
            UIService.showNotification('Website configuration added', 'success');
            if (addWebsiteModal) addWebsiteModal.style.display = 'none';
            this.renderWebsiteList();
            UIService.updateLastAction('Website config added');
          })
          .catch(error => {
            console.error('Error adding website configuration:', error);
            UIService.showNotification(`Failed to add: ${error.message}`, 'error');
          });
      }
    } catch (error) {
      console.error('Error saving website configuration:', error);
      UIService.showNotification(`Failed to save: ${error.message}`, 'error');
    }
  }
  
  /**
   * Handle test website configuration click
   * @private
   */
  handleTestWebsiteConfigClick() {
    const name = document.getElementById('website-name')?.value.trim();
    const baseUrl = document.getElementById('website-base-url')?.value.trim();
    const urlPattern = document.getElementById('website-url-pattern')?.value.trim();
    const chapterContent = document.getElementById('website-chapter-content')?.value.trim();
    const chapterTitle = document.getElementById('website-chapter-title')?.value.trim();
    const prevChapter = document.getElementById('website-prev-chapter')?.value.trim();
    const nextChapter = document.getElementById('website-next-chapter')?.value.trim();
    
    if (!name || !baseUrl || !urlPattern || !chapterContent || !chapterTitle) {
      UIService.showNotification('Name, base URL, URL pattern, content selector, and title selector are required', 'warning');
      return;
    }
    
    // Ask for a test URL
    const testUrl = prompt('Enter a test URL (must match the URL pattern):');
    if (!testUrl) return;
    
    UIService.toggleLoading(true, 'Testing website configuration...');
    
    try {
      const config = {
        name: name,
        baseUrl: baseUrl,
        urlPattern: urlPattern,
        selectors: {
          chapterContent: chapterContent,
          chapterTitle: chapterTitle,
          prevChapter: prevChapter,
          nextChapter: nextChapter
        },
        isActive: true
      };
      
      this.testWebsiteConfiguration(config, testUrl)
        .then(result => {
          UIService.toggleLoading(false);
          
          if (result.success) {
            UIService.showNotification(`Test successful! Found: ${result.data.chapterName}`, 'success');
            
            // Display preview information
            alert(`Test Results:
- Chapter Name: ${result.data.chapterName}
- Text Preview: ${result.data.textPreview}
- Has Next Link: ${result.data.hasNextLink ? 'Yes' : 'No'}
- Has Previous Link: ${result.data.hasPrevLink ? 'Yes' : 'No'}`);
          } else {
            UIService.showNotification(`Test failed: ${result.message}`, 'error');
          }
        })
        .catch(error => {
          UIService.toggleLoading(false);
          UIService.showNotification(`Test failed: ${error.message}`, 'error');
          console.error('Error testing website configuration:', error);
        });
    } catch (error) {
      UIService.toggleLoading(false);
      UIService.showNotification(`Test failed: ${error.message}`, 'error');
      console.error('Error testing website configuration:', error);
    }
  }
  
  /**
   * Handle chapter search input
   * @param {Event} e - Input event
   * @private
   */
  handleChapterSearchInput(e) {
    const query = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('#chapter-list-body tr');
    
    rows.forEach(row => {
      const title = row.cells[1]?.textContent.toLowerCase() || '';
      const source = row.cells[2]?.textContent.toLowerCase() || '';
      
      if (title.includes(query) || source.includes(query)) {
        row.style.display = '';
      } else {
        row.style.display = 'none';
      }
    });
  }
  
  /**
   * Handle select all chapters change
   * @param {Event} e - Change event
   * @private
   */
  handleSelectAllChaptersChange(e) {
    const checkboxes = document.querySelectorAll('#chapter-list-body input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      checkbox.checked = e.target.checked;
    });
  }
  
  /**
   * Handle delete selected chapters click
   * @private
   */
  handleDeleteSelectedChaptersClick() {
    const selectedCheckboxes = document.querySelectorAll('#chapter-list-body input[type="checkbox"]:checked');
    if (selectedCheckboxes.length === 0) {
      UIService.showNotification('No chapters selected', 'warning');
      return;
    }
    
    if (!confirm(`Are you sure you want to delete ${selectedCheckboxes.length} selected chapter(s)?`)) return;
    
    UIService.toggleLoading(true, 'Deleting chapters...');
    
    const deletePromises = Array.from(selectedCheckboxes).map(checkbox => {
      const chapterId = checkbox.value;
      return this.deleteChapter(chapterId);
    });
    
    Promise.all(deletePromises)
      .then(() => {
        // Refresh the library
        const currentProject = ProjectService.getCurrentProject();
        if (currentProject) {
          this.renderChapterLibrary(currentProject.id);
        }
        
        UIService.toggleLoading(false);
        UIService.showNotification(`${selectedCheckboxes.length} chapter(s) deleted`, 'success');
        UIService.updateLastAction('Chapters deleted');
      })
      .catch(error => {
        UIService.toggleLoading(false);
        UIService.showNotification(`Failed to delete chapters: ${error.message}`, 'error');
        console.error('Error deleting chapters:', error);
      });
  }
  
  /**
   * Fetch a chapter from a URL
   * @param {string} url - Chapter URL
   * @param {number} count - Number of chapters to fetch
   * @returns {Promise<void>}
   */
  async fetchChapter(url, count = 1) {
    try {
      const currentProject = ProjectService.getCurrentProject();
      if (!currentProject) {
        UIService.showNotification('Please select a project first', 'warning');
        return;
      }
      
      UIService.toggleLoading(true, 'Fetching chapter...');
      UIService.toggleProgressBar(true);
      UIService.updateProgress(0, 'Connecting to server...');
      
      const response = await fetch('http://localhost:3003/fetch-chapter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url, count })
      });
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        const chapterName = document.getElementById('chapter-name');
        const chapterText = document.getElementById('chapter-text');
        
        if (chapterName) chapterName.textContent = data.chapterName || 'Unnamed Chapter';
        if (chapterText) chapterText.value = data.rawText || '';
        
        // Update navigation buttons
        const prevChapterBtn = document.getElementById('prev-chapter-btn');
        const nextChapterBtn = document.getElementById('next-chapter-btn');
        
        if (prevChapterBtn) prevChapterBtn.disabled = !data.prevLink;
        if (nextChapterBtn) nextChapterBtn.disabled = !data.nextLink;
        
        // Update project state
        currentProject.currentChapter = {
          url: data.nextLink || url,
          prevLink: data.prevLink,
          nextLink: data.nextLink
        };
        currentProject.currentChapterName = data.chapterName;
        
        // Save to project
        await ProjectService.updateProject(currentProject);
        
        // Save chapter to database
        await this.saveChapter({
          projectId: currentProject.id,
          title: data.chapterName || 'Unnamed Chapter',
          url: url,
          content: data.rawText,
          prevLink: data.prevLink,
          nextLink: data.nextLink,
          dateAdded: new Date().toISOString()
        });
        
        UIService.updateWordCounts();
        UIService.showNotification(`Fetched ${count} chapter(s) successfully.`, 'success');
        UIService.updateLastAction('Chapters fetched');
      } else {
        UIService.showNotification(data.message, 'error');
      }
      
      UIService.toggleLoading(false);
      UIService.toggleProgressBar(false);
      UIService.updateProgress(100, 'Complete');
    } catch (error) {
      UIService.toggleLoading(false);
      UIService.toggleProgressBar(false);
      UIService.showNotification(`Fetch failed: ${error.message}. Check the URL or network connection.`, 'error');
      console.error('Error fetching chapter:', error);
    }
  }
  
  /**
   * Save a chapter to the database
   * @param {Object} chapter - Chapter to save
   * @returns {Promise<Object>} Saved chapter
   */
  async saveChapter(chapter) {
    try {
      if (!chapter.projectId) {
        throw new Error('Project ID is required');
      }
      
      if (!chapter.url) {
        throw new Error('Chapter URL is required');
      }
      
      // Generate ID if not provided
      if (!chapter.id) {
        chapter.id = StorageService.generateUUID();
      }
      
      // Add timestamp if not provided
      if (!chapter.dateAdded) {
        chapter.dateAdded = new Date().toISOString();
      }
      
      return StorageService.saveItem('chapters', chapter);
    } catch (error) {
      console.error('Error saving chapter:', error);
      throw error;
    }
  }
  
  /**
   * Get chapters for a project
   * @param {string} projectId - Project ID
   * @returns {Promise<Array>} Project chapters
   */
  async getProjectChapters(projectId) {
    try {
      if (!projectId) {
        throw new Error('Project ID is required');
      }
      
      return StorageService.getByIndex('chapters', 'projectId', projectId);
    } catch (error) {
      console.error('Error getting project chapters:', error);
      throw error;
    }
  }
  
  /**
   * Delete a chapter
   * @param {string} chapterId - Chapter ID to delete
   * @returns {Promise<void>}
   */
  async deleteChapter(chapterId) {
    try {
      if (!chapterId) {
        throw new Error('Chapter ID is required');
      }
      
      return StorageService.deleteItem('chapters', chapterId);
    } catch (error) {
      console.error('Error deleting chapter:', error);
      throw error;
    }
  }
  
  /**
   * Add a new website configuration
   * @param {Object} config - Website configuration
   * @returns {Promise<Object>} Added configuration
   */
  async addWebsiteConfiguration(config) {
    try {
      if (!config.name || !config.baseUrl || !config.urlPattern) {
        throw new Error('Name, base URL, and URL pattern are required');
      }
      
      // Validate selectors
      if (!config.selectors || 
          !config.selectors.chapterContent || 
          !config.selectors.chapterTitle) {
        throw new Error('Chapter content and title selectors are required');
      }
      
      // Generate ID if not provided
      if (!config.id) {
        config.id = StorageService.generateUUID();
      }
      
      // Set active by default
      if (config.isActive === undefined) {
        config.isActive = true;
      }
      
      await StorageService.saveItem('websiteConfigs', config);
      
      // Invalidate cache
      this.websiteConfigsCache = null;
      
      return config;
    } catch (error) {
      console.error('Error adding website configuration:', error);
      throw error;
    }
  }
  
  /**
   * Update a website configuration
   * @param {Object} config - Updated configuration
   * @returns {Promise<Object>} Updated configuration
   */
  async updateWebsiteConfiguration(config) {
    try {
      if (!config.id) {
        throw new Error('Configuration ID is required');
      }
      
      await StorageService.saveItem('websiteConfigs', config);
      
      // Invalidate cache
      this.websiteConfigsCache = null;
      
      return config;
    } catch (error) {
      console.error('Error updating website configuration:', error);
      throw error;
    }
  }
  
  /**
   * Delete a website configuration
   * @param {string} id - Configuration ID
   * @returns {Promise<void>}
   */
  async deleteWebsiteConfiguration(id) {
    try {
      if (!id) {
        throw new Error('Configuration ID is required');
      }
      
      await StorageService.deleteItem('websiteConfigs', id);
      
      // Invalidate cache
      this.websiteConfigsCache = null;
    } catch (error) {
      console.error('Error deleting website configuration:', error);
      throw error;
    }
  }
  
  /**
   * Get all website configurations
   * @returns {Promise<Array>} Array of website configurations
   */
  async getWebsiteConfigurations() {
    try {
      // Check cache
      if (this.websiteConfigsCache) {
        return this.websiteConfigsCache;
      }
      
      const configs = await StorageService.getAllItems('websiteConfigs');
      this.websiteConfigsCache = configs;
      return configs;
    } catch (error) {
      console.error('Error getting website configurations:', error);
      throw error;
    }
  }
  
  /**
   * Get a website configuration by ID
   * @param {string} id - Website configuration ID
   * @returns {Promise<Object|null>} Website configuration
   */
  async getWebsiteConfigurationById(id) {
    try {
      if (!id) return null;
      
      return StorageService.getItem('websiteConfigs', id);
    } catch (error) {
      console.error('Error getting website configuration:', error);
      throw error;
    }
  }
  
  /**
   * Check if a URL is supported by the configured website patterns
   * @param {string} url - URL to check
   * @returns {Promise<boolean>} Whether the URL is supported
   */
  async isSupportedUrl(url) {
    try {
      if (!url) return false;
      
      // Get website configurations
      const configs = await this.getWebsiteConfigurations();
      
      // Check each configuration
      for (const config of configs) {
        if (!config.isActive) continue;
        
        try {
          const regex = new RegExp(config.urlPattern);
          if (regex.test(url)) {
            return true;
          }
        } catch (error) {
          console.warn(`Invalid URL pattern for ${config.name}:`, error);
        }
      }
      
      return false;
    } catch (error) {
      console.error('Error checking if URL is supported:', error);
      return false;
    }
  }
  
  /**
   * Test a website configuration with a sample URL
   * @param {Object} config - Website configuration to test
   * @param {string} testUrl - URL to test with
   * @returns {Promise<Object>} Test results
   */
  async testWebsiteConfiguration(config, testUrl) {
    try {
      if (!config || !testUrl) {
        throw new Error('Configuration and test URL are required');
      }
      
      // First check if URL matches the pattern
      const patternRegex = new RegExp(config.urlPattern);
      const patternMatch = patternRegex.test(testUrl);
      
      if (!patternMatch) {
        return {
          success: false,
          message: 'The test URL does not match the URL pattern',
          details: {
            patternMatch: false
          }
        };
      }
      
      // Temporarily add the configuration
      const tempId = `temp-${Date.now()}`;
      const tempConfig = {
        ...config,
        id: tempId,
        isActive: true
      };
      
      await StorageService.saveItem('websiteConfigs', tempConfig);
      this.websiteConfigsCache = null;
      
      try {
        // Try to fetch the chapter
        const response = await fetch('http://localhost:3003/fetch-chapter', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ url: testUrl, count: 1 })
        });
        
        const data = await response.json();
        
        // Clean up temporary configuration
        await StorageService.deleteItem('websiteConfigs', tempId);
        this.websiteConfigsCache = null;
        
        if (!data.success) {
          return {
            success: false,
            message: data.message || 'Failed to fetch chapter with this configuration',
            details: {
              patternMatch: true,
              fetchSuccess: false
            }
          };
        }
        
        return {
          success: true,
          message: 'Configuration test successful!',
          data: {
            chapterName: data.chapterName,
            textPreview: data.rawText.substring(0, 200) + '...',
            hasNextLink: !!data.nextLink,
            hasPrevLink: !!data.prevLink
          },
          details: {
            patternMatch: true,
            fetchSuccess: true
          }
        };
      } catch (error) {
        // Clean up temporary configuration on error
        await StorageService.deleteItem('websiteConfigs', tempId);
        this.websiteConfigsCache = null;
        
        return {
          success: false,
          message: `Fetch failed: ${error.message}`,
          details: {
            patternMatch: true,
            fetchSuccess: false,
            error: error.message
          }
        };
      }
    } catch (error) {
      console.error('Error testing website configuration:', error);
      return {
        success: false,
        message: `Test failed: ${error.message}`,
        details: {
          error: error.message
        }
      };
    }
  }
  
  /**
   * Render the website list
   * @returns {Promise<void>}
   */
  async renderWebsiteList() {
    try {
      const websiteList = document.querySelector('.website-list');
      if (!websiteList) return;
      
      // Clear the list
      websiteList.innerHTML = '';
      
      const configs = await this.getWebsiteConfigurations();
      
      if (configs.length === 0) {
        websiteList.innerHTML = '<div class="empty-state">No website configurations yet.</div>';
        return;
      }
      
      // Sort by name
      configs.sort((a, b) => a.name.localeCompare(b.name));
      
      // Create elements for each config
      for (const config of configs) {
        const item = document.createElement('div');
        item.className = 'website-item';
        
        item.innerHTML = `
          <div class="website-info">
            <h4>${config.name}</h4>
            <span class="status ${config.isActive ? 'active' : 'inactive'}">${config.isActive ? 'Active' : 'Inactive'}</span>
          </div>
          <div class="website-actions">
            <button class="edit-website-btn small-btn"><i class="fas fa-edit"></i></button>
            <button class="delete-website-btn small-btn" ${config.name === 'trxs.cc' || config.name === '69yuedu.net' ? 'disabled' : ''}><i class="fas fa-trash"></i></button>
            <button class="toggle-website-btn small-btn"><i class="fas fa-${config.isActive ? 'eye-slash' : 'eye'}"></i></button>
          </div>
        `;
        
        // Set up edit button
        const editBtn = item.querySelector('.edit-website-btn');
        if (editBtn) {
          editBtn.addEventListener('click', () => {
            document.getElementById('website-name').value = config.name;
            document.getElementById('website-base-url').value = config.baseUrl;
            document.getElementById('website-url-pattern').value = config.urlPattern;
            document.getElementById('website-chapter-content').value = config.selectors.chapterContent;
            document.getElementById('website-chapter-title').value = config.selectors.chapterTitle;
            document.getElementById('website-prev-chapter').value = config.selectors.prevChapter || '';
            document.getElementById('website-next-chapter').value = config.selectors.nextChapter || '';
            
            // Store the config ID for update
            const addWebsiteModal = document.getElementById('add-website-modal');
            if (addWebsiteModal) {
              addWebsiteModal.dataset.configId = config.id;
              addWebsiteModal.style.display = 'flex';
            }
          });
        }
        
        // Set up delete button
        if (!(config.name === 'trxs.cc' || config.name === '69yuedu.net')) {
          const deleteBtn = item.querySelector('.delete-website-btn');
          if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
              if (confirm(`Are you sure you want to delete the configuration for ${config.name}?`)) {
                this.deleteWebsiteConfiguration(config.id)
                  .then(() => {
                    item.remove();
                    UIService.showNotification('Website configuration deleted', 'success');
                    UIService.updateLastAction('Website config deleted');
                  })
                  .catch(error => {
                    console.error('Error deleting website configuration:', error);
                    UIService.showNotification(`Failed to delete: ${error.message}`, 'error');
                  });
              }
            });
          }
        }
        
        // Set up toggle button
        const toggleBtn = item.querySelector('.toggle-website-btn');
        if (toggleBtn) {
          toggleBtn.addEventListener('click', () => {
            config.isActive = !config.isActive;
            this.updateWebsiteConfiguration(config)
              .then(() => {
                // Update UI
                const statusEl = item.querySelector('.status');
                if (statusEl) {
                  statusEl.className = `status ${config.isActive ? 'active' : 'inactive'}`;
                  statusEl.textContent = config.isActive ? 'Active' : 'Inactive';
                }
                
                toggleBtn.innerHTML = `<i class="fas fa-${config.isActive ? 'eye-slash' : 'eye'}"></i>`;
                
                UIService.showNotification(`${config.name} ${config.isActive ? 'activated' : 'deactivated'}`, 'success');
                UIService.updateLastAction(`Website ${config.isActive ? 'activated' : 'deactivated'}`);
              })
              .catch(error => {
                console.error('Error toggling website configuration:', error);
                UIService.showNotification(`Failed to toggle: ${error.message}`, 'error');
              });
          });
        }
        
        websiteList.appendChild(item);
      }
    } catch (error) {
      console.error('Error rendering website list:', error);
      const websiteList = document.querySelector('.website-list');
      if (websiteList) {
        websiteList.innerHTML = '<div class="empty-state">Error loading website configurations.</div>';
      }
    }
  }
  
  /**
   * Render the chapter library
   * @param {string} projectId - Project ID
   * @returns {Promise<void>}
   */
  async renderChapterLibrary(projectId) {
    try {
      const tableBody = document.getElementById('chapter-list-body');
      if (!tableBody || !projectId) return;
      
      // Clear table
      tableBody.innerHTML = '';
      
      const chapters = await this.getProjectChapters(projectId);
      
      if (chapters.length === 0) {
        const emptyRow = document.createElement('tr');
        const emptyCell = document.createElement('td');
        emptyCell.colSpan = 5;
        emptyCell.className = 'empty-state';
        emptyCell.textContent = 'No chapters saved for this project. Use the Chapter Fetcher to download chapters.';
        emptyRow.appendChild(emptyCell);
        tableBody.appendChild(emptyRow);
        return;
      }
      
      // Sort by date added (newest first)
      chapters.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));
      
      // Add each chapter
      chapters.forEach(chapter => {
        const row = document.createElement('tr');
        
        // Checkbox
        const checkboxCell = document.createElement('td');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = chapter.id;
        checkboxCell.appendChild(checkbox);
        row.appendChild(checkboxCell);
        
        // Title
        const titleCell = document.createElement('td');
        titleCell.textContent = chapter.title || 'Unnamed Chapter';
        row.appendChild(titleCell);
        
        // Source
        const sourceCell = document.createElement('td');
        sourceCell.textContent = this.getDomainFromUrl(chapter.url);
        row.appendChild(sourceCell);
        
        // Date Added
        const dateCell = document.createElement('td');
        dateCell.textContent = new Date(chapter.dateAdded).toLocaleString();
        row.appendChild(dateCell);
        
        // Actions
        const actionsCell = document.createElement('td');
        actionsCell.className = 'chapter-actions';
        
        // Load button
        const loadBtn = document.createElement('button');
        loadBtn.innerHTML = '<i class="fas fa-file-import"></i>';
        loadBtn.title = 'Load chapter';
        loadBtn.className = 'small-btn';
        loadBtn.addEventListener('click', () => {
          document.getElementById('chapter-name').textContent = chapter.title || 'Unnamed Chapter';
          document.getElementById('chapter-text').value = chapter.content || '';
          document.getElementById('chapter-url').value = chapter.url || '';
          
          // Set navigation buttons
          document.getElementById('prev-chapter-btn').disabled = !chapter.prevLink;
          document.getElementById('next-chapter-btn').disabled = !chapter.nextLink;
          
          // Update project
          const currentProject = ProjectService.getCurrentProject();
          if (currentProject) {
            currentProject.currentChapter = {
              url: chapter.url,
              prevLink: chapter.prevLink,
              nextLink: chapter.nextLink
            };
            currentProject.currentChapterName = chapter.title;
            ProjectService.updateProject(currentProject);
          }
          
          // Update word count
          UIService.updateWordCounts();
          UIService.showNotification('Chapter loaded', 'success');
          UIService.updateLastAction('Chapter loaded from library');
          
          // Switch to main tab
          UIService.activateSecondaryTab('fetch-chapters');
        });
        actionsCell.appendChild(loadBtn);
        
        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
        deleteBtn.title = 'Delete chapter';
        deleteBtn.className = 'small-btn';
        deleteBtn.addEventListener('click', () => {
          if (confirm(`Are you sure you want to delete "${chapter.title || 'Unnamed Chapter'}"?`)) {
            this.deleteChapter(chapter.id)
              .then(() => {
                row.remove();
                UIService.showNotification('Chapter deleted', 'success');
                UIService.updateLastAction('Chapter deleted');
              })
              .catch(error => {
                console.error('Error deleting chapter:', error);
                UIService.showNotification(`Failed to delete: ${error.message}`, 'error');
              });
          }
        });
        actionsCell.appendChild(deleteBtn);
        
        row.appendChild(actionsCell);
        tableBody.appendChild(row);
      });
    } catch (error) {
      console.error('Error rendering chapter library:', error);
      const tableBody = document.getElementById('chapter-list-body');
      if (tableBody) {
        const errorRow = document.createElement('tr');
        const errorCell = document.createElement('td');
        errorCell.colSpan = 5;
        errorCell.className = 'empty-state error';
        errorCell.textContent = `Error loading chapters: ${error.message}`;
        errorRow.appendChild(errorCell);
        tableBody.appendChild(errorRow);
      }
    }
  }
  
  /**
   * Get domain name from URL
   * @param {string} url - URL to extract domain from
   * @returns {string} Domain name
   * @private
   */
  getDomainFromUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (error) {
      return url;
    }
  }
}

// Create a singleton instance
const chapterFetcherService = new ChapterFetcherService();

// Export default instance
export default chapterFetcherService;

// Also export class for testing or extending
export { ChapterFetcherService };