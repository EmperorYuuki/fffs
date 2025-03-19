/**
 * ChatGPTService.js - Module for interaction with ChatGPT API
 * Refactored with correct import paths
 */

// Fix import paths to use the correct relative paths
import ProjectService from './ProjectService.js';
import UIService from '../core/UIService.js';
import TextService from '../core/TextService.js';
import GlossaryService from './GlossaryService.js';

/**
 * Class for handling ChatGPT API interactions and translations
 */
class ChatGPTService {
  /**
   * Create a new ChatGPTService instance
   */
  constructor() {
    // State tracking
    this.isTranslating = false;
    this.abortController = null;
  }

  /**
   * Initialize the ChatGPT service
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      console.log('Initializing ChatGPTService');
      
      // Set up login button handler
      const chatgptLoginBtn = document.getElementById('chatgpt-login-btn');
      if (chatgptLoginBtn) {
        chatgptLoginBtn.addEventListener('click', this.initiateChatGPTLogin.bind(this));
      }
      
      const verifyChatgptBtn = document.getElementById('verify-chatgpt-btn');
      if (verifyChatgptBtn) {
        verifyChatgptBtn.addEventListener('click', this.verifyChatGPTLogin.bind(this));
      }
      
      // Add event handlers for translation buttons
      const translateBtn = document.getElementById('translate-btn');
      if (translateBtn) {
        translateBtn.addEventListener('click', this.handleTranslateButtonClick.bind(this));
      }
      
      const previewBtn = document.getElementById('preview-btn');
      if (previewBtn) {
        previewBtn.addEventListener('click', this.handlePreviewButtonClick.bind(this));
      }
      
      const translateAllBtn = document.getElementById('translate-all-btn');
      if (translateAllBtn) {
        translateAllBtn.addEventListener('click', this.handleTranslateAllButtonClick.bind(this));
      }
      
      const refineBtn = document.getElementById('refine-btn');
      if (refineBtn) {
        refineBtn.addEventListener('click', this.handleRefineButtonClick.bind(this));
      }
      
      // Set up prompt toggle with localStorage persistence
      const includePromptToggle = document.getElementById('include-prompt-toggle');
      if (includePromptToggle) {
        // Load saved state from localStorage
        const savedState = localStorage.getItem('includePrompt');
        if (savedState !== null) {
          includePromptToggle.checked = savedState === 'true';
        } else {
          // Default to true and save the default
          includePromptToggle.checked = true;
          localStorage.setItem('includePrompt', 'true');
        }
        
        // Add change listener
        includePromptToggle.addEventListener('change', function() {
          localStorage.setItem('includePrompt', this.checked.toString());
          UIService.updateLastAction('Prompt inclusion ' + (this.checked ? 'enabled' : 'disabled'));
        });
      }
      
      console.log('ChatGPTService initialized successfully');
      return Promise.resolve();
    } catch (error) {
      console.error('Error initializing ChatGPT service:', error);
      return Promise.reject(error);
    }
  }
  
  /**
   * Handle click on the translate button
   * @private
   */
  handleTranslateButtonClick() {
    const currentProject = ProjectService.getCurrentProject();
    if (!currentProject) {
      UIService.showNotification('Please select a project first', 'warning');
      return;
    }
    
    // Check if using ChatGPT or OpenRouter
    if (currentProject.settings?.translationMethod === 'openrouter') {
      // Use OpenRouter instead
      try {
        // Dynamically import OpenRouterService to avoid circular dependencies
        import('./OpenRouterService.js').then(module => {
          const OpenRouterService = module.default;
          OpenRouterService.translateText();
        });
      } catch (error) {
        UIService.showNotification('OpenRouter service not available', 'error');
      }
      return;
    }
    
    // Use ChatGPT
    const inputText = document.getElementById('input-text')?.value.trim();
    if (!inputText) {
      UIService.showNotification('Please enter text to translate', 'warning');
      return;
    }
    
    this.translateText(inputText);
  }
  
  /**
   * Handle click on the preview button
   * @private
   */
  handlePreviewButtonClick() {
    const currentProject = ProjectService.getCurrentProject();
    if (!currentProject) {
      UIService.showNotification('Please select a project first', 'warning');
      return;
    }
    
    const inputText = document.getElementById('input-text')?.value.trim();
    if (!inputText) {
      UIService.showNotification('Please enter text to preview', 'warning');
      return;
    }
    
    // Use the current chunking strategy to get the first chunk
    const strategy = document.getElementById('chunking-strategy')?.value || 'auto';
    const chunkSize = parseInt(document.getElementById('chunk-size')?.value) || 1000;
    const chunks = TextService.chunkText(inputText, strategy, chunkSize);
    
    if (chunks.length === 0) {
      UIService.showNotification('No valid text chunks to preview', 'warning');
      return;
    }
    
    // Only preview the first chunk
    this.previewTranslation(chunks[0]);
  }
  
  /**
   * Handle click on the translate all button
   * @private
   */
  handleTranslateAllButtonClick() {
    const currentProject = ProjectService.getCurrentProject();
    if (!currentProject) {
      UIService.showNotification('Please select a project first', 'warning');
      return;
    }
    
    const chapterText = document.getElementById('chapter-text')?.value.trim();
    if (!chapterText) {
      UIService.showNotification('No chapter text to translate', 'warning');
      return;
    }
    
    this.translateText(chapterText);
  }
  
  /**
   * Handle click on the refine button
   * @private
   */
  handleRefineButtonClick() {
    const currentProject = ProjectService.getCurrentProject();
    if (!currentProject) {
      UIService.showNotification('Please select a project first', 'warning');
      return;
    }
    
    const quill = UIService.getQuill();
    if (!quill) {
      UIService.showNotification('No translation to refine', 'warning');
      return;
    }
    
    const currentText = quill.getText().trim();
    if (!currentText) {
      UIService.showNotification('No translation to refine', 'warning');
      return;
    }
    
    const refinementPrompt = prompt('Enter refinement instructions (optional):');
    if (refinementPrompt === null) return; // User cancelled
    
    const refinementText = `${currentText}\n\nRefinement: ${refinementPrompt || 'Improve this translation while keeping the same meaning and style.'}`;
    
    this.translateText(refinementText, true);
  }
  
  /**
   * Initiate ChatGPT login
   * @returns {Promise<void>}
   */
  async initiateChatGPTLogin() {
    try {
      UIService.toggleLoading(true, 'Initiating ChatGPT login...');
      UIService.toggleProgressBar(true);
      UIService.updateProgress(0, 'Connecting to server...');
      
      const response = await fetch('http://localhost:3003/initiate-login');
      const data = await response.json();
      
      UIService.toggleLoading(false);
      UIService.toggleProgressBar(false);
      UIService.updateProgress(100, 'Complete');
      
      if (data.success) {
        // If projects were returned, update the project list
        if (data.projects && Array.isArray(data.projects)) {
          // Sync projects with ChatGPT
          await this.syncProjects(data.projects);
        }
        
        UIService.showNotification(data.message, 'success');
        UIService.updateLastAction('ChatGPT login completed');
      } else {
        UIService.showNotification(data.message || 'Login failed', 'error');
        UIService.updateLastAction('ChatGPT login failed');
      }
    } catch (error) {
      UIService.toggleLoading(false);
      UIService.toggleProgressBar(false);
      UIService.showNotification(`Login failed: ${error.message}`, 'error');
      UIService.updateLastAction('ChatGPT login error');
      console.error('Error initiating ChatGPT login:', error);
    }
  }
  
  /**
   * Verify ChatGPT login status
   * @returns {Promise<void>}
   */
  async verifyChatGPTLogin() {
    try {
      UIService.toggleLoading(true, 'Verifying ChatGPT login...');
      UIService.toggleProgressBar(true);
      UIService.updateProgress(0, 'Connecting to server...');
      
      const response = await fetch('http://localhost:3003/verify-login');
      const data = await response.json();
      
      UIService.toggleLoading(false);
      UIService.toggleProgressBar(false);
      UIService.updateProgress(100, 'Complete');
      UIService.showNotification(data.message, data.success ? 'success' : 'warning');
      UIService.updateLastAction('ChatGPT login verified');
    } catch (error) {
      UIService.toggleLoading(false);
      UIService.toggleProgressBar(false);
      UIService.showNotification(`Verification failed: ${error.message}`, 'error');
      UIService.updateLastAction('ChatGPT verification error');
      console.error('Error verifying ChatGPT login:', error);
    }
  }
  
  /**
   * Sync projects with ChatGPT
   * @param {Array} chatGptProjects - Array of projects from ChatGPT
   * @returns {Promise<void>}
   */
  async syncProjects(chatGptProjects) {
    if (!Array.isArray(chatGptProjects) || chatGptProjects.length === 0) return;
    
    try {
      // Get local projects
      const localProjects = await ProjectService.getAllProjects();
      
      const projectUpdates = [];
      
      // Sync each ChatGPT project
      for (const chatGptProject of chatGptProjects) {
        const existingProject = localProjects.find(p => p.name === chatGptProject.name);
        
        if (existingProject) {
          // Update existing project
          existingProject.href = chatGptProject.href;
          existingProject.instructions = chatGptProject.instructions;
          projectUpdates.push(ProjectService.updateProject(existingProject));
        } else {
          // Create new project
          const newProject = await ProjectService.createProject(chatGptProject.name);
          
          // Update the new project with properties from ChatGPT
          newProject.href = chatGptProject.href;
          newProject.instructions = chatGptProject.instructions;
          newProject.chatGPTUrl = `https://chatgpt.com${chatGptProject.href}`;
          
          // Save the updated project
          projectUpdates.push(ProjectService.updateProject(newProject));
        }
      }
      
      // Wait for all project updates
      await Promise.all(projectUpdates);
      
      // Refresh project list
      await ProjectService.renderProjectList();
      
      UIService.showNotification('Projects synchronized with ChatGPT', 'success');
      UIService.updateLastAction('Projects synchronized');
    } catch (error) {
      console.error('Error syncing projects:', error);
      UIService.showNotification(`Project synchronization error: ${error.message}`, 'error');
      throw error;
    }
  }
  
  /**
   * Translate text using ChatGPT
   * @param {string} text - Text to translate
   * @param {boolean} isRefinement - Whether this is a refinement request
   * @returns {Promise<void>}
   */
  async translateText(text, isRefinement = false) {
    if (this.isTranslating) {
      UIService.showNotification('Translation already in progress', 'warning');
      return;
    }

    const currentProject = ProjectService.getCurrentProject();
    if (!currentProject) {
      UIService.showNotification('Please select a project first', 'warning');
      return;
    }

    if (!text || !text.trim()) {
      UIService.showNotification('Please enter text to translate', 'warning');
      return;
    }

    // Check if we have a ChatGPT URL
    if (!currentProject.chatGPTUrl) {
      UIService.showNotification('Please set a ChatGPT conversation URL in project settings', 'warning');
      return;
    }

    this.isTranslating = true;

    try {
      UIService.toggleLoading(true, 'Preparing translation...');
      UIService.toggleProgressBar(true);
      UIService.updateProgress(0, 'Analyzing text...');

      // Get chunking settings
      const strategy = document.getElementById('chunking-strategy')?.value || 'auto';
      const chunkSize = parseInt(document.getElementById('chunk-size')?.value) || 1000;

      // Check if glossary should be applied
      const applyGlossaryToggle = document.getElementById('apply-glossary-toggle');
      const shouldApplyGlossary = applyGlossaryToggle ? applyGlossaryToggle.checked : true; // Default to true

      // Get prompt toggle state
      const includePromptToggle = document.getElementById('include-prompt-toggle');
      const includePrompt = includePromptToggle ? includePromptToggle.checked : true; // Default to true

      // Process text with glossary if needed
      let textToTranslate = text;
      
      if (shouldApplyGlossary && !isRefinement) {
        try {
          // Apply glossary if available and toggle is on
          const glossaryEntries = await GlossaryService.getGlossaryEntries(currentProject.id);
          
          if (glossaryEntries.length > 0) {
            textToTranslate = GlossaryService.applyGlossary(text, glossaryEntries);
            console.log(`Applied ${glossaryEntries.length} glossary terms`);
            UIService.showNotification(`Applied ${glossaryEntries.length} glossary terms before translation`, 'info', 3000);
          } else {
            console.log('No glossary terms to apply');
          }
        } catch (error) {
          console.error('Error applying glossary:', error);
          // Continue with original text on error
        }
      } else if (!isRefinement && !shouldApplyGlossary) {
        UIService.showNotification('Glossary application skipped (toggle is off)', 'info', 3000);
      }

      // For very large texts with no chunking, show a warning
      if (strategy === 'none' && textToTranslate.length > 50000) {
        if (!confirm('The text is very large (over 50KB). Processing it as a single unit may cause issues with API limits or slow performance. Continue anyway?')) {
          UIService.toggleLoading(false);
          UIService.toggleProgressBar(false);
          this.isTranslating = false;
          return;
        }
      }

      // Pass both includePrompt AND chunking strategy
      await this.performTranslation(
        textToTranslate, 
        currentProject, 
        isRefinement, 
        includePrompt,
        strategy === 'none' // Pass noChunking flag
      );
    } catch (error) {
      this.isTranslating = false;
      UIService.toggleLoading(false);
      UIService.toggleProgressBar(false);
      UIService.showNotification(`Translation error: ${error.message}`, 'error');
      UIService.updateLastAction('Translation failed');
      console.error('Error in translateText:', error);
    }
  }

  /**
   * Perform translation of a single chunk without splitting
   * @param {string} text - Text to translate
   * @param {Object} project - The current project
   * @param {boolean} isRefinement - Whether this is a refinement
   * @param {boolean} includePrompt - Whether to include the prompt
   * @returns {Promise<void>}
   * @private
   */
  async performSingleChunkTranslation(text, project, isRefinement, includePrompt = true) {
    try {
      // Set up abort controller for cancellation
      this.abortController = new AbortController();
      const signal = this.abortController.signal;

      // Create request data with isRawText parameter
      const requestData = {
        text: text,
        chatGPTUrl: project.chatGPTUrl,
        promptPrefix: project.instructions || 'Follow the instructions carefully and first check the memory for the glossary. Ensure that all terms are correctly used and consistent. Maintain full sentences and paragraphs—do not cut them off mid-sentence or with dashes:',
        isRawText: !includePrompt
      };
      
      console.log('Sending single chunk translation request with isRawText:', !includePrompt);
      
      // Send request
      const response = await fetch('http://localhost:3003/chunk-and-translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData),
        signal: signal
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      
      // Process the streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let translation = '';
      
      UIService.updateProgress(30, 'Receiving translation...');
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            break;
          }
          
          // Decode the chunk and add to buffer
          buffer += decoder.decode(value, { stream: true });
          
          // Split by double newlines (SSE format)
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';
          
          // Process each event
          for (const part of parts) {
            if (!part.trim()) continue;
            
            const lines = part.split('\n');
            let eventType = '';
            let dataStr = '';
            
            for (const line of lines) {
              if (line.startsWith('event:')) {
                eventType = line.substring(6).trim();
              } else if (line.startsWith('data:')) {
                dataStr = line.substring(5).trim();
              }
            }
            
            if (!dataStr) continue;
            
            try {
              const parsedData = JSON.parse(dataStr);
              
              if (eventType === 'progress') {
                translation = parsedData.partial || '';
                UIService.updateProgress(
                  30 + (parsedData.progress * 0.6), // Scale from 30% to 90%
                  `Translating... ${Math.round(parsedData.progress)}%`
                );
                
                // Update translation in editor
                const quill = UIService.getQuill();
                if (quill) {
                  quill.setText(translation);
                }
              } else if (eventType === 'complete') {
                translation = parsedData.translation;
                
                // Set the translation in the editor
                const quill = UIService.getQuill();
                if (quill) {
                  quill.setText(translation);
                  
                  // Save to the project
                  await ProjectService.updateProjectOutput(
                    project.id,
                    quill.getContents().ops
                  );
                }
                
                UIService.updateProgress(100, 'Translation complete');
                UIService.showNotification('Translation completed successfully', 'success');
                UIService.updateLastAction('Translation completed');
                UIService.updateWordCounts();
                
                // Verify translation if enabled
                if (project.settings?.autoVerify && project.settings?.openRouterApiKey) {
                  this.verifyTranslation(text, translation);
                }
              }
            } catch (error) {
              console.error('Error processing translation update:', error);
            }
          }
        }
      } catch (error) {
        if (error.name === 'AbortError') {
          console.log('Translation was cancelled');
          throw new Error('Translation cancelled');
        } else {
          throw error;
        }
      }
    } catch (error) {
      // Error handling
      console.error('Error in single chunk translation:', error);
      throw error;
    } finally {
      this.isTranslating = false;
      this.abortController = null;
      UIService.toggleLoading(false);
      UIService.toggleProgressBar(false);
    }
  }

  /**
   * Perform the actual translation request
   * @param {string} text - Text to translate
   * @param {Object} project - The current project
   * @param {boolean} isRefinement - Whether this is a refinement
   * @param {boolean} includePrompt - Whether to include the prompt
   * @param {boolean} noChunking - Whether to process text without chunking
   * @returns {Promise<void>}
   * @private
   */
  async performTranslation(text, project, isRefinement, includePrompt = true, noChunking = false) {
    try {
      // Set up abort controller for cancellation
      this.abortController = new AbortController();
      const signal = this.abortController.signal;

      // Create request data with BOTH parameters
      const requestData = {
        text: text,
        chatGPTUrl: project.chatGPTUrl,
        promptPrefix: project.instructions || 'Follow the instructions carefully and first check the memory for the glossary. Ensure that all terms are correctly used and consistent. Maintain full sentences and paragraphs—do not cut them off mid-sentence or with dashes:',
        isRawText: !includePrompt,
        noChunking: noChunking  // Add this parameter
      };
      
      console.log('Sending translation request:', {
        isRawText: !includePrompt,
        noChunking: noChunking
      });
      
      // Send request
      const response = await fetch('http://localhost:3003/chunk-and-translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData),
        signal: signal
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      
      // Process the streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let fullTranslation = '';
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            break;
          }
          
          // Decode the chunk and add to buffer
          buffer += decoder.decode(value, { stream: true });
          
          // Split by double newlines (SSE format)
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';
          
          // Process each event
          for (const part of parts) {
            if (!part.trim()) continue;
            
            const lines = part.split('\n');
            let eventType = '';
            let dataStr = '';
            
            for (const line of lines) {
              if (line.startsWith('event:')) {
                eventType = line.substring(6).trim();
              } else if (line.startsWith('data:')) {
                dataStr = line.substring(5).trim();
              }
            }
            
            if (!dataStr) continue;
            
            try {
              const parsedData = JSON.parse(dataStr);
              
              if (eventType === 'start') {
                console.log('Translation started');
              } else if (eventType === 'end') {
                fullTranslation = parsedData.translation;
                
                // Set the translation in the editor
                const quill = UIService.getQuill();
                if (quill) {
                  quill.setText(fullTranslation);
                  
                  // Save to the project
                  await ProjectService.updateProjectOutput(
                    project.id,
                    quill.getContents().ops
                  );
                }
                
                UIService.updateProgress(100, 'Translation complete');
                UIService.showNotification('Translation completed successfully', 'success');
                UIService.updateLastAction('Translation completed');
                UIService.updateWordCounts();
                
                // Verify translation if enabled
                if (project.settings?.autoVerify && project.settings?.openRouterApiKey) {
                  this.verifyTranslation(text, fullTranslation);
                }
              } else if (eventType === 'error') {
                throw new Error(parsedData.error);
              } else {
                // Update progress
                if (parsedData.total > 0) {
                  const progress = Math.round((parsedData.chunk / parsedData.total) * 100);
                  UIService.updateProgress(progress, `Translating chunk ${parsedData.chunk}/${parsedData.total}`);
                  
                  // Update translation in editor
                  if (parsedData.partial) {
                    const quill = UIService.getQuill();
                    if (quill) {
                      quill.setText(parsedData.partial);
                    }
                  }
                }
              }
            } catch (error) {
              console.error('Error processing translation update:', error);
            }
          }
        }
      } catch (error) {
        if (error.name === 'AbortError') {
          console.log('Translation was cancelled');
          UIService.showNotification('Translation cancelled', 'info');
          throw new Error('Translation cancelled');
        } else {
          throw error;
        }
      } finally {
        this.isTranslating = false;
        this.abortController = null;
        UIService.toggleLoading(false);
        UIService.toggleProgressBar(false);
      }
    } catch (error) {
      this.isTranslating = false;
      this.abortController = null;
      
      UIService.toggleLoading(false);
      UIService.toggleProgressBar(false);
      
      if (error.name !== 'AbortError' && error.message !== 'Translation cancelled') {
        UIService.showNotification(`Translation failed: ${error.message}`, 'error');
        UIService.updateLastAction('Translation failed');
      }
      
      throw error;
    }
  }
  
  /**
   * Preview translation of a chunk
   * @param {string} text - Text to preview
   * @returns {Promise<void>}
   */
  async previewTranslation(text) {
    if (this.isTranslating) {
      UIService.showNotification('Translation already in progress', 'warning');
      return;
    }
    
    const currentProject = ProjectService.getCurrentProject();
    if (!currentProject) {
      UIService.showNotification('Please select a project first', 'warning');
      return;
    }
    
    if (!text || !text.trim()) {
      UIService.showNotification('Please enter text to preview', 'warning');
      return;
    }
    
    // Check if we have a ChatGPT URL
    if (!currentProject.chatGPTUrl) {
      UIService.showNotification('Please set a ChatGPT conversation URL in project settings', 'warning');
      return;
    }
    
    this.isTranslating = true;
    
    try {
      UIService.toggleLoading(true, 'Preparing preview...');
      UIService.toggleProgressBar(true);
      UIService.updateProgress(0, 'Analyzing text...');
      
      // Apply glossary if available
      let textToTranslate = text;
      try {
        const glossaryEntries = await GlossaryService.getGlossaryEntries(currentProject.id);
        if (glossaryEntries.length > 0) {
          textToTranslate = GlossaryService.applyGlossary(text, glossaryEntries);
        }
      } catch (error) {
        console.error('Error applying glossary:', error);
        // Continue with original text on error
      }
      
      // Get prompt toggle state
      const includePromptToggle = document.getElementById('include-prompt-toggle');
      const includePrompt = includePromptToggle ? includePromptToggle.checked : true; // Default to true
      
      // Prepare text with respect to prompt toggle
      const requestText = includePrompt
        ? TextService.generateTranslationPrompt(textToTranslate, currentProject.instructions)
        : textToTranslate;
      
      // Set up abort controller for cancellation
      this.abortController = new AbortController();
      const signal = this.abortController.signal;
      
      // Create request data
      const requestData = {
        text: requestText,
        chatGPTUrl: currentProject.chatGPTUrl,
        promptPrefix: currentProject.instructions || 'Follow the instructions carefully and first check the memory for the glossary. Ensure that all terms are correctly used and consistent. Maintain full sentences and paragraphs—do not cut them off mid-sentence or with dashes:'
      };
      
      const response = await fetch('http://localhost:3003/chunk-and-translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData),
        signal: signal
      });
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      
      // Process the streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let previewTranslation = '';
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            break;
          }
          
          // Decode the chunk and add to buffer
          buffer += decoder.decode(value, { stream: true });
          
          // Split by double newlines (SSE format)
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';
          
          // Process each event
          for (const part of parts) {
            if (!part.trim()) continue;
            
            const lines = part.split('\n');
            let eventType = '';
            let dataStr = '';
            
            for (const line of lines) {
              if (line.startsWith('event:')) {
                eventType = line.substring(6).trim();
              } else if (line.startsWith('data:')) {
                dataStr = line.substring(5).trim();
              }
            }
            
            if (!dataStr) continue;
            
            try {
              const parsedData = JSON.parse(dataStr);
              
              if (eventType === 'end') {
                previewTranslation = parsedData.translation;
                
                // Set the translation in the editor with a preview marker
                const quill = UIService.getQuill();
                if (quill) {
                  quill.setText(`${previewTranslation}\n\n--- Preview of first chunk only ---`);
                }
                
                UIService.updateProgress(100, 'Preview complete');
                UIService.showNotification('Preview generated successfully', 'success');
                UIService.updateLastAction('Preview generated');
                UIService.updateWordCounts();
              } else if (eventType === 'error') {
                throw new Error(parsedData.error);
              } else {
                // Update progress
                UIService.updateProgress(parsedData.progress || 50, 'Generating preview...');
                
                // Update translation in editor
                if (parsedData.partial) {
                  const quill = UIService.getQuill();
                  if (quill) {
                    quill.setText(`${parsedData.partial}\n\n--- Preview in progress... ---`);
                  }
                }
              }
            } catch (error) {
              console.error('Error processing preview update:', error);
            }
          }
        }
      } catch (error) {
        if (error.name === 'AbortError') {
          console.log('Preview was cancelled');
          UIService.showNotification('Preview cancelled', 'info');
          throw new Error('Preview cancelled');
        } else {
          throw error;
        }
      } finally {
        this.isTranslating = false;
        this.abortController = null;
        UIService.toggleLoading(false);
        UIService.toggleProgressBar(false);
      }
    } catch (error) {
      this.isTranslating = false;
      this.abortController = null;
      
      UIService.toggleLoading(false);
      UIService.toggleProgressBar(false);
      
      if (error.name !== 'AbortError' && error.message !== 'Preview cancelled') {
        UIService.showNotification(`Preview failed: ${error.message}`, 'error');
        UIService.updateLastAction('Preview failed');
      }
      
      console.error('Preview error:', error);
    }
  }
  
  /**
   * Verify translation quality using OpenRouter
   * @param {string} sourceText - Original text
   * @param {string} translatedText - Translated text
   * @returns {Promise<void>}
   */
  async verifyTranslation(sourceText, translatedText) {
    const currentProject = ProjectService.getCurrentProject();
    if (!currentProject) return;
    
    try {
      // Dynamically import OpenRouterService to avoid circular dependencies
      const { default: OpenRouterService } = await import('./OpenRouterService.js');
      
      // Check if OpenRouter is configured for verification
      if (!currentProject.settings?.openRouterApiKey || !currentProject.settings?.openRouterModel) {
        console.log('OpenRouter not configured for verification');
        return;
      }
      
      UIService.showNotification('Verifying translation quality...', 'info');
      
      // Run verification
      const results = await OpenRouterService.verifyTranslation(
        sourceText,
        translatedText,
        currentProject.settings.openRouterModel
      );
      
      console.log('Verification results:', results);
      
      // Display verification results
      const accuracy = results.accuracy || 0;
      const completeness = results.completeness || 0;
      
      let qualityLevel;
      if (accuracy >= 90 && completeness >= 90) {
        qualityLevel = 'excellent';
      } else if (accuracy >= 75 && completeness >= 75) {
        qualityLevel = 'good';
      } else if (accuracy >= 60 && completeness >= 60) {
        qualityLevel = 'fair';
      } else {
        qualityLevel = 'poor';
      }
      
      // Create verification notification
      let message = `Translation quality: ${qualityLevel.toUpperCase()}\n`;
      message += `Accuracy: ${accuracy}%, Completeness: ${completeness}%`;
      
      if (results.issues && results.issues.length > 0) {
        message += `\nFound ${results.issues.length} issues that may need review.`;
      }
      
      UIService.showNotification(message, qualityLevel === 'poor' ? 'warning' : 'info', 10000);
    } catch (error) {
      console.error('Translation verification error:', error);
    }
  }
  
  /**
   * Cancel ongoing translation
   */
  cancelTranslation() {
    if (this.isTranslating && this.abortController) {
      this.abortController.abort();
      this.isTranslating = false;
      
      UIService.toggleLoading(false);
      UIService.toggleProgressBar(false);
      UIService.showNotification('Translation cancelled', 'info');
      UIService.updateLastAction('Translation cancelled');
    }
  }
}

// Create a singleton instance
const chatGPTService = new ChatGPTService();

// Export default instance
export default chatGPTService;

// Also export class for testing or extending
export { ChatGPTService };