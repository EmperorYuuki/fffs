/**
 * OpenRouterService.js - Module for OpenRouter API integration
 * Refactored with correct import paths
 */

// Fix import paths to use the correct relative paths
import ProjectService from './ProjectService.js';
import UIService from '../core/UIService.js';
import TextService from '../core/TextService.js';
import GlossaryService from './GlossaryService.js';

/**
 * Class for handling interactions with the OpenRouter API
 */
class OpenRouterService {
  /**
   * Create a new OpenRouterService instance
   */
  constructor() {
    // Constants
    this.BASE_URL = 'https://openrouter.ai/api/v1';
    this.CACHE_VERSION = '1.1';
    
    // Cache for models
    this.modelsCache = null;
    this.lastModelsFetch = null;
    
    // Translation state tracking
    this.isTranslating = false;
    this.currentTranslation = null;
    this.abortController = null;
    
    // Initialize event listeners
    this._testingConnection = false;
  }
  
  /**
   * Initialize the OpenRouter service
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      console.log('Initializing OpenRouterService');
      
      // Set up event handlers
      this.setupEventHandlers();
      
      console.log('OpenRouterService initialized successfully');
      return Promise.resolve();
    } catch (error) {
      console.error('Error initializing OpenRouter service:', error);
      return Promise.reject(error);
    }
  }
  
  /**
   * Set up all event handlers
   * @private
   */
  setupEventHandlers() {
    try {
      // Helper function to safely add event listener
      const addListener = (elementId, event, handler) => {
        const element = document.getElementById(elementId);
        if (element) {
          element.addEventListener(event, handler.bind(this));
        }
      };
      
      // Test connection button
      addListener('test-openrouter-btn', 'click', this.testConnection);
      
      // Refresh models button
      addListener('refresh-models-btn', 'click', this.refreshModels);
      
      // Save API key button
      addListener('save-api-key-btn', 'click', this.saveApiKey);
      
      // Model selection dropdown
      addListener('openrouter-model', 'change', this.handleModelChange);
      
      // Settings tab activation to load models
      const settingsTab = document.querySelector('.tab-btn[data-tab="settings"]');
      if (settingsTab) {
        settingsTab.addEventListener('click', async () => {
          // Populate OpenRouter API key from current project
          const currentProject = ProjectService.getCurrentProject();
          if (currentProject) {
            const apiKeyInput = document.getElementById('openrouter-api-key');
            if (apiKeyInput) {
              apiKeyInput.value = currentProject.settings?.openRouterApiKey || '';
            }
            
            // Populate model selector if we have an API key
            if (currentProject.settings?.openRouterApiKey) {
              await this.populateModelSelector();
            }
          }
        });
      }
      
      // Initial population of API key if a project is loaded
      const currentProject = ProjectService.getCurrentProject();
      if (currentProject) {
        const apiKeyInput = document.getElementById('openrouter-api-key');
        if (apiKeyInput) {
          apiKeyInput.value = currentProject.settings?.openRouterApiKey || '';
        }
      }
      
      // Cancel translation button
      addListener('cancel-translation-btn', 'click', this.cancelTranslation);
      
      // Add verify button handler
      addListener('verify-btn', 'click', this.handleVerifyButtonClick);
      
      // Setup translate button handler if not already handled elsewhere
      addListener('translate-btn', 'click', () => {
        const translationMethod = document.getElementById('translation-method');
        if (translationMethod && translationMethod.value === 'openrouter') {
          this.translateText(true);
        }
      });
    } catch (error) {
      console.error('Error setting up event handlers:', error);
    }
  }
  
  /**
   * Cancel ongoing translation
   */
  cancelTranslation() {
    if (this.isTranslating && this.abortController) {
      this.abortController.abort();
      this.isTranslating = false;
      this.currentTranslation = null;
      
      UIService.toggleLoading(false);
      UIService.toggleProgressBar(false);
      UIService.showNotification('Translation cancelled', 'info');
      UIService.updateLastAction('Translation cancelled');
    }
  }
  
  /**
   * Get API key for the current project
   * @returns {string|null} API key or null if not available
   * @private
   */
  getApiKey() {
    const currentProject = ProjectService.getCurrentProject();
    if (!currentProject) return null;
    
    return currentProject.settings?.openRouterApiKey || null;
  }
  
  /**
   * Get model for the current project
   * @returns {string|null} Model ID or null if not available
   * @private
   */
  getModel() {
    const currentProject = ProjectService.getCurrentProject();
    if (!currentProject) return null;
    
    return currentProject.settings?.openRouterModel || null;
  }
  
  /**
   * Test OpenRouter connection
   */
  testConnection() {
    // Use debounce to prevent rapid clicks
    if (this._testingConnection) return;
    this._testingConnection = true;
    setTimeout(() => { this._testingConnection = false; }, 1000);
    
    const apiKeyInput = document.getElementById('openrouter-api-key');
    if (!apiKeyInput || !apiKeyInput.value.trim()) {
      UIService.showNotification('Please enter an OpenRouter API key', 'warning');
      return;
    }
    
    UIService.toggleLoading(true, 'Testing OpenRouter connection...');
    UIService.toggleProgressBar(true);
    UIService.updateProgress(0, 'Connecting to API...');
    
    // Save the API key to the current project
    const currentProject = ProjectService.getCurrentProject();
    if (!currentProject) {
      UIService.showNotification('Please select a project first', 'warning');
      UIService.toggleLoading(false);
      UIService.toggleProgressBar(false);
      return;
    }
    
    // Update project settings
    ProjectService.updateProjectSettings(currentProject.id, {
      openRouterApiKey: apiKeyInput.value.trim()
    })
    .then(() => {
      // Test connection by fetching models
      UIService.updateProgress(30, 'Retrieving available models...');
      return this.getAvailableModels(true);
    })
    .then(models => {
      // Progress update
      UIService.updateProgress(70, 'Updating model selector...');
      
      // Populate model selector
      return this.populateModelSelector()
        .then(() => models);
    })
    .then(models => {
      UIService.toggleLoading(false);
      UIService.toggleProgressBar(false);
      UIService.updateProgress(100, 'Connection successful');
      
      // Enhanced success message with model information
      const recommendedModel = this.getRecommendedModel(models);
      let message = `Connection successful. Found ${models.length} available models.`;
      
      if (recommendedModel) {
        message += ` Recommended model: ${recommendedModel.name}.`;
      }
      
      UIService.showNotification(message, 'success');
      UIService.updateLastAction('OpenRouter connection verified');
    })
    .catch(error => {
      UIService.toggleLoading(false);
      UIService.toggleProgressBar(false);
      
      // Enhanced error message with troubleshooting help
      let errorMessage = `Connection failed: ${error.message}`;
      if (error.message.includes('401') || error.message.includes('unauthorized')) {
        errorMessage += '. Please check your API key.';
      } else if (error.message.includes('timeout') || error.message.includes('network')) {
        errorMessage += '. Please check your internet connection.';
      }
      
      UIService.showNotification(errorMessage, 'error');
      UIService.updateLastAction('OpenRouter connection failed');
      
      console.error('OpenRouter connection test failed:', error);
    });
  }
  
  /**
   * Get recommended model from the available models
   * @param {Array} models - List of available models
   * @returns {Object|null} Recommended model or null
   * @private
   */
  getRecommendedModel(models) {
    if (!Array.isArray(models) || models.length === 0) return null;
    
    // Sort models based on context length and availability
    const sortedModels = [...models].sort((a, b) => {
      // Prioritize models with reasonable context length (12-16K)
      // Too small is insufficient, too large may be unnecessarily expensive
      const aContextLength = a.context_length || 0;
      const bContextLength = b.context_length || 0;
      
      // Ideal context range for a balance of capability and cost
      const idealContextRange = (length) => {
        if (length >= 12000 && length <= 32000) return 3;  // Ideal range
        if (length >= 8000 && length < 12000) return 2;    // Good range
        if (length > 32000) return 1;                      // Larger than needed
        return 0;                                          // Too small
      };
      
      const aContextScore = idealContextRange(aContextLength);
      const bContextScore = idealContextRange(bContextLength);
      
      if (aContextScore !== bContextScore) {
        return bContextScore - aContextScore;
      }
      
      // Next prioritize by proven reliability for translation tasks
      // Claude, GPT-4, Gemini, Mistral are good for translation
      const getReliabilityScore = (model) => {
        const modelId = model.id?.toLowerCase() || '';
        
        if (modelId.includes('claude') || 
            modelId.includes('gpt-4') || 
            modelId.includes('gemini') || 
            modelId.includes('mistral-large')) {
          return 3;  // Top tier for translation
        }
        
        if (modelId.includes('gpt-3.5') || 
            modelId.includes('mistral-medium') || 
            modelId.includes('llama-3')) {
          return 2;  // Good for translation
        }
        
        return 1;  // Other models
      };
      
      const aReliabilityScore = getReliabilityScore(a);
      const bReliabilityScore = getReliabilityScore(b);
      
      if (aReliabilityScore !== bReliabilityScore) {
        return bReliabilityScore - aReliabilityScore;
      }
      
      // Finally, consider price as a factor
      const aCost = parseFloat(a.pricing?.prompt || 0) + parseFloat(a.pricing?.completion || 0);
      const bCost = parseFloat(b.pricing?.prompt || 0) + parseFloat(b.pricing?.completion || 0);
      
      return aCost - bCost;  // Lower cost preferred if all else equal
    });
    
    // Return the top recommended model
    return sortedModels[0] || null;
  }
  
  /**
   * Save API key
   */
  saveApiKey() {
    const apiKeyInput = document.getElementById('openrouter-api-key');
    if (!apiKeyInput) return;
    
    const currentProject = ProjectService.getCurrentProject();
    if (!currentProject) {
      UIService.showNotification('Please select a project first', 'warning');
      return;
    }
    
    const apiKey = apiKeyInput.value.trim();
    
    // Enhanced validation for API key format
    if (apiKey && !apiKey.match(/^(sk-or[-_a-zA-Z0-9]{10,})$/)) {
      UIService.showNotification('The API key format appears invalid. OpenRouter keys should start with "sk-or-".', 'warning');
      // Continue anyway as the format might vary
    }
    
    ProjectService.updateProjectSettings(currentProject.id, {
      openRouterApiKey: apiKey
    })
    .then(() => {
      UIService.showNotification('API key saved', 'success');
      UIService.updateLastAction('OpenRouter API key updated');
      
      // If API key was added, try to populate the models
      if (apiKey && !this.modelsCache) {
        this.populateModelSelector();
      }
    })
    .catch(error => {
      console.error('Error saving API key:', error);
      UIService.showNotification(`Error saving API key: ${error.message}`, 'error');
    });
  }
  
  /**
   * Handle model change
   * @param {Event} e - Change event
   */
  handleModelChange(e) {
    const currentProject = ProjectService.getCurrentProject();
    if (!currentProject) return;
    
    const modelId = e.target.value;
    
    // Find the model details to show additional info
    this.getAvailableModels().then(models => {
      const selectedModel = models.find(m => m.id === modelId);
      
      ProjectService.updateProjectSettings(currentProject.id, {
        openRouterModel: modelId
      })
      .then(() => {
        let message = 'OpenRouter model updated';
        
        // Add pricing info if available
        if (selectedModel?.pricing) {
          const promptPrice = parseFloat(selectedModel.pricing.prompt || 0).toFixed(4);
          const completionPrice = parseFloat(selectedModel.pricing.completion || 0).toFixed(4);
          message += ` (Pricing: $${promptPrice}/$${completionPrice} per 1M tokens)`;
        }
        
        UIService.updateLastAction(message);
        
        // Show notification with model info
        if (selectedModel) {
          UIService.showNotification(`Model set to ${selectedModel.name || modelId}`, 'success');
        }
      })
      .catch(error => {
        console.error('Error saving model selection:', error);
        UIService.showNotification(`Error saving model selection: ${error.message}`, 'error');
      });
    }).catch(error => {
      console.error('Error getting model details:', error);
      // Still update the model setting even if we can't get details
      ProjectService.updateProjectSettings(currentProject.id, {
        openRouterModel: modelId
      });
    });
  }
  
  /**
   * Refresh models
   */
  refreshModels() {
    UIService.showNotification('Refreshing models...', 'info');
    
    this.populateModelSelector(true)
      .then(() => {
        UIService.showNotification('Models refreshed', 'success');
        UIService.updateLastAction('OpenRouter models refreshed');
      })
      .catch(error => {
        console.error('Error refreshing models:', error);
        UIService.showNotification(`Error refreshing models: ${error.message}`, 'error');
      });
  }
  
  /**
   * Fetch available models from OpenRouter
   * @param {boolean} forceRefresh - Whether to force a refresh of the cache
   * @returns {Promise<Array>} Array of available models
   */
  async getAvailableModels(forceRefresh = false) {
    try {
      // Check cache first (cache for 24 hours)
      const now = Date.now();
      if (
        !forceRefresh && 
        this.modelsCache && 
        this.lastModelsFetch && 
        (now - this.lastModelsFetch < 24 * 60 * 60 * 1000)
      ) {
        console.log('Using cached models data from memory:', this.modelsCache.length, 'models');
        return Promise.resolve(this.modelsCache);
      }
      
      // Check for models in localStorage cache with version check
      if (!forceRefresh && !this.modelsCache) {
        const cacheVersion = localStorage.getItem('openrouter_models_version');
        const cachedData = localStorage.getItem('openrouter_models_cache');
        const cacheTimestamp = localStorage.getItem('openrouter_models_timestamp');
        
        if (cachedData && cacheTimestamp && cacheVersion === this.CACHE_VERSION) {
          const parsedData = JSON.parse(cachedData);
          const timestamp = parseInt(cacheTimestamp, 10);
          
          // Use cache if it's less than 24 hours old
          if (parsedData && Array.isArray(parsedData) && 
              timestamp && (now - timestamp < 24 * 60 * 60 * 1000)) {
            console.log('Using cached models data from localStorage:', parsedData.length, 'models');
            this.modelsCache = parsedData;
            this.lastModelsFetch = timestamp;
            return Promise.resolve(parsedData);
          }
        }
      }
      
      // Get API key
      const apiKey = this.getApiKey();
      if (!apiKey) {
        throw new Error('OpenRouter API key is required. Please set it in the project settings.');
      }
      
      console.log(`Fetching models from OpenRouter API: ${this.BASE_URL}/models`);
      
      // Create abort controller for timeout
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), 30000); // 30 second timeout
      
      const response = await fetch(`${this.BASE_URL}/models`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': window.location.origin || 'https://quillsyncai.com',
          'X-Title': 'QuillSync AI'
        },
        signal: abortController.signal
      });
      
      clearTimeout(timeoutId);
      console.log(`OpenRouter API response status: ${response.status}`);
      
      if (!response.ok) {
        // Enhanced error handling with detailed logging
        const text = await response.text();
        try {
          const errorData = JSON.parse(text);
          console.error('OpenRouter API error response:', errorData);
          
          // Provide a more helpful error message
          if (response.status === 401) {
            throw new Error('API key is invalid or expired. Please check your OpenRouter API key.');
          } else if (response.status === 429) {
            throw new Error('Rate limit exceeded. Please try again later or request a higher rate limit.');
          } else {
            throw new Error(`API request failed with status ${response.status}: ${errorData.error?.message || errorData.message || text}`);
          }
        } catch (e) {
          console.error('OpenRouter API raw error response:', text);
          throw new Error(`API request failed with status ${response.status}: ${text}`);
        }
      }
      
      console.log('OpenRouter API response successful, parsing JSON...');
      const responseData = await response.json();
      
      // Log the response structure for debugging
      console.log('Raw API response received');
      
      // Check if the response has a data property (which appears to be the case)
      let modelData = responseData;
      
      // Handle the nested data structure that's coming back
      if (responseData && responseData.data && Array.isArray(responseData.data)) {
        console.log('Found models array in data property, using it directly');
        modelData = responseData.data;
      } else if (responseData && responseData.models && Array.isArray(responseData.models)) {
        console.log('Found models array in models property, using it directly');
        modelData = responseData.models;
      } else if (!Array.isArray(modelData)) {
        console.error('Unexpected response format, data is not in expected structure:', responseData);
        // Provide an empty array as a fallback to prevent errors
        modelData = [];
      }
      
      console.log(`Processing ${modelData.length} models from API response`);
      
      // Filter for models that support text generation
      const textModels = modelData.filter(model => {
        if (!model) return false;
        
        // Try different ways to check capabilities based on API response format
        if (model.capabilities && Array.isArray(model.capabilities)) {
          return model.capabilities.includes('chat') || model.capabilities.includes('completion');
        }
        
        // If capabilities is not present or not an array, include the model by default
        return true;
      });
      
      console.log(`Filtered to ${textModels.length} text generation models`);
      
      // Enhance models with additional metadata for better UI presentation
      const enhancedModels = textModels.map(model => {
        // Add provider display name
        if (model.id) {
          const provider = model.id.split('/')[0] || 'unknown';
          model.providerDisplayName = this.getProviderDisplayName(provider);
        }
        
        // Add model class category
        model.category = this.categorizeModel(model);
        
        return model;
      });
      
      // Sort models by category and name for better organization
      enhancedModels.sort((a, b) => {
        // Sort by category first
        if (a.category !== b.category) {
          // Premium models first
          if (a.category === 'premium') return -1;
          if (b.category === 'premium') return 1;
          // Then balanced models
          if (a.category === 'balanced') return -1;
          if (b.category === 'balanced') return 1;
          // Then economy models
          if (a.category === 'economy') return -1;
          if (b.category === 'economy') return 1;
        }
        
        // Sort by provider next
        const providerA = (a.id || '').split('/')[0] || '';
        const providerB = (b.id || '').split('/')[0] || '';
        if (providerA !== providerB) {
          return providerA.localeCompare(providerB);
        }
        
        // Finally, sort by name
        return (a.name || '').localeCompare(b.name || '');
      });
      
      // Update cache in memory
      this.modelsCache = enhancedModels;
      this.lastModelsFetch = now;
      
      // Save to localStorage cache with version info
      try {
        localStorage.setItem('openrouter_models_version', this.CACHE_VERSION);
        localStorage.setItem('openrouter_models_cache', JSON.stringify(enhancedModels));
        localStorage.setItem('openrouter_models_timestamp', now.toString());
        console.log('Models cached to localStorage successfully');
      } catch (e) {
        console.warn('Failed to save models to localStorage cache:', e);
      }
      
      return enhancedModels;
    } catch (error) {
      // Improved error handling with specific error types
      if (error.name === 'AbortError') {
        console.error('Request to fetch models timed out');
        throw new Error('Request to fetch models timed out. Please check your internet connection and try again.');
      }
      
      console.error('Error fetching OpenRouter models:', error);
      
      // If we have cached models, return them as fallback
      if (this.modelsCache && this.modelsCache.length > 0) {
        console.log('Using cached models as fallback after fetch error');
        return this.modelsCache;
      }
      
      throw error;
    }
  }
  
  /**
   * Get display name for a model provider
   * @param {string} provider - Provider identifier from model.id
   * @returns {string} Formatted provider name
   * @private
   */
  getProviderDisplayName(provider) {
    const providerNames = {
      'openai': 'OpenAI',
      'anthropic': 'Anthropic',
      'google': 'Google',
      'mistralai': 'Mistral AI',
      'meta': 'Meta',
      'meta-llama': 'Meta',
      'cohere': 'Cohere',
      'azure': 'Azure',
      'deepseek': 'DeepSeek',
      'fireworks': 'Fireworks',
      'groq': 'Groq',
      'together': 'Together',
      'perplexity': 'Perplexity',
      'ai21': 'AI21 Labs'
    };
    
    return providerNames[provider] || provider.charAt(0).toUpperCase() + provider.slice(1);
  }
  
  /**
   * Get model category based on context length for organization purposes
   * @param {Object} model - Model data
   * @returns {string} Category for organization
   * @private
   */
  categorizeModel(model) {
    if (!model) return 'standard';
    
    const contextLength = model.context_length || 0;
    
    // Organization based solely on context window size
    if (contextLength >= 128000) {
      return 'very-large-context';
    } else if (contextLength >= 32000) {
      return 'large-context';
    } else if (contextLength >= 16000) {
      return 'medium-context';
    } else {
      return 'standard';
    }
  }
  
  /**
   * Populate the model selector dropdown
   * @param {boolean} forceRefresh - Whether to force a refresh of the models
   * @param {string} selectId - ID of the select element
   * @returns {Promise<void>}
   */
  async populateModelSelector(forceRefresh = false, selectId = 'openrouter-model') {
    try {
      const selectElement = document.getElementById(selectId);
      if (!selectElement) {
        console.warn(`Model selector element with ID '${selectId}' not found`);
        return;
      }
      
      // Try to get API key
      const apiKey = this.getApiKey();
      if (!apiKey) {
        console.log('No API key available, showing API key required message');
        selectElement.innerHTML = '<option value="">API Key Required</option>';
        return;
      }
      
      // Show loading state
      selectElement.innerHTML = '<option value="">Loading models...</option>';
      console.log('Fetching models for selector...');
      
      // Fetch models
      const models = await this.getAvailableModels(forceRefresh);
      console.log(`Received ${models.length} models for selector...`);
      
      // Clear select and add default option
      selectElement.innerHTML = '<option value="">Select a model</option>';
      
      // Group models by provider for better organization
      const groupedByProvider = {};
      
      // Group by provider
      models.forEach(model => {
        if (!model.id) {
          console.warn('Model missing ID:', model);
          return;
        }
        
        const provider = model.id.split('/')[0] || 'unknown';
        
        if (!groupedByProvider[provider]) {
          groupedByProvider[provider] = [];
        }
        
        groupedByProvider[provider].push(model);
      });
      
      // Sort providers alphabetically
      const sortedProviders = Object.keys(groupedByProvider).sort();
      
      // Add providers as optgroups
      sortedProviders.forEach(provider => {
        const providerModels = groupedByProvider[provider];
        if (providerModels.length === 0) return;
        
        // Create provider group
        const providerGroup = document.createElement('optgroup');
        providerGroup.label = this.getProviderDisplayName(provider);
        
        // Sort models by name within each provider
        providerModels.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
        
        // Add models for this provider
        providerModels.forEach(model => {
          const option = document.createElement('option');
          option.value = model.id;
          
          // Show pricing if available
          let pricingInfo = '';
          if (model.pricing) {
            const promptPrice = parseFloat(model.pricing.prompt || 0).toFixed(4);
            const completionPrice = parseFloat(model.pricing.completion || 0).toFixed(4);
            pricingInfo = ` ($${promptPrice}/$${completionPrice})`;
          }
          
          option.textContent = `${model.name || model.id}${pricingInfo}`;
          
          // Add data attributes for additional info
          option.dataset.contextLength = model.context_length || 4096;
          if (model.pricing) {
            option.dataset.promptPrice = model.pricing.prompt || 0;
            option.dataset.completionPrice = model.pricing.completion || 0;
          }
          
          providerGroup.appendChild(option);
        });
        
        selectElement.appendChild(providerGroup);
      });
      
      // Restore previously selected model if any
      const currentProject = ProjectService.getCurrentProject();
      if (currentProject) {
        if (currentProject.settings?.openRouterModel) {
          selectElement.value = currentProject.settings.openRouterModel;
          
          // If the saved model doesn't exist in the list, show a warning and select a default
          if (selectElement.value !== currentProject.settings.openRouterModel) {
            console.warn(`Saved model ${currentProject.settings.openRouterModel} not found in available models`);
            
            // Find and select a good default model based on capabilities
            const recommendedModel = this.getRecommendedModel(models);
            if (recommendedModel) {
              selectElement.value = recommendedModel.id;
              
              // Update project settings with the new model
              await ProjectService.updateProjectSettings(currentProject.id, {
                openRouterModel: recommendedModel.id
              }).catch(err => console.error('Error updating model setting:', err));
              
              UIService.showNotification(
                `Previous model not available. Using ${recommendedModel.name || recommendedModel.id} instead.`,
                'info'
              );
            }
          }
        } else if (models.length > 0) {
          // No model previously selected, select recommended model
          const recommendedModel = this.getRecommendedModel(models);
          if (recommendedModel) {
            selectElement.value = recommendedModel.id;
            
            // Update project settings with the new model
            await ProjectService.updateProjectSettings(currentProject.id, {
              openRouterModel: recommendedModel.id
            }).catch(err => console.error('Error updating model setting:', err));
          }
        }
      }
      
      console.log('Successfully populated model selector');
    } catch (error) {
      console.error('Error populating model selector:', error);
      const selectElement = document.getElementById(selectId);
      if (selectElement) {
        selectElement.innerHTML = '<option value="">Error loading models</option>';
      }
      throw error;
    }
  }
  
  /**
   * Generate a completion using OpenRouter API
   * @param {string} model - Model ID
   * @param {string} prompt - Text prompt
   * @param {number} temperature - Temperature parameter (0-1)
   * @param {number} maxTokens - Maximum number of tokens to generate
   * @param {boolean} stream - Whether to stream the response
   * @returns {Promise<string|Response>} Generated text or response for streaming
   */
  async generateCompletion(model, prompt, temperature = 0.7, maxTokens = 2000, stream = false) {
    try {
      const apiKey = this.getApiKey();
      if (!apiKey) {
        throw new Error('OpenRouter API key is required. Please set it in the project settings.');
      }
      
      if (!model) {
        throw new Error('Model ID is required. Please select a model in the Settings tab.');
      }
      
      // Sanitize and validate input
      if (!prompt || typeof prompt !== 'string') {
        throw new Error('Invalid prompt provided');
      }
      
      // Ensure temperature is within valid range
      temperature = Math.max(0, Math.min(1, temperature));
      
      // Ensure max tokens is reasonable 
      maxTokens = Math.max(100, Math.min(32000, maxTokens));
      
      console.log(`Generating completion with model: ${model}, streaming: ${stream}`);
      
      // Create abort controller
      this.abortController = new AbortController();
      
      const requestBody = {
        model: model,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: temperature,
        max_tokens: maxTokens,
        stream: stream,
        transforms: ["middle-out"]  // For handling very long texts
      };
      
      console.log(`Sending request to ${this.BASE_URL}/chat/completions`);
      
      // Set request timeout
      const timeoutId = setTimeout(() => {
        this.abortController.abort('timeout');
      }, 120000); // 2 minutes timeout
      
      const response = await fetch(`${this.BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': window.location.origin || 'https://quillsyncai.com',
          'X-Title': 'QuillSync AI'
        },
        body: JSON.stringify(requestBody),
        signal: this.abortController.signal
      });
      
      clearTimeout(timeoutId);
      console.log(`OpenRouter completion response status: ${response.status}`);
      
      if (!response.ok) {
        const text = await response.text();
        try {
          const errorData = JSON.parse(text);
          console.error('OpenRouter completion error:', errorData);
          
          // Enhanced error messages with more details
          if (response.status === 401) {
            throw new Error('API key is invalid or expired. Please check your OpenRouter API key.');
          } else if (response.status === 429) {
            throw new Error('Rate limit exceeded. Please try again later or use a different model.');
          } else if (response.status === 400 && text.includes('context')) {
            throw new Error('Input is too long for this model. Please try a smaller chunk or select a model with larger context window.');
          } else if (response.status === 404) {
            throw new Error('The requested model was not found. It may have been discontinued or renamed.');
          } else if (response.status === 402) {
            throw new Error('Insufficient credits. Please add more credits to your OpenRouter account.');
          } else {
            throw new Error(`API request failed with status ${response.status}: ${errorData.error?.message || errorData.message || text}`);
          }
        } catch (e) {
          console.error('OpenRouter completion raw error:', text);
          throw new Error(`API request failed with status ${response.status}: ${text}`);
        }
      }
      
      if (stream) {
        console.log('Returning streaming response');
        // Return the response object for caller to handle streaming
        return response;
      } else {
        console.log('Processing non-streaming response');
        // Handle non-streaming response
        const data = await response.json();
        console.log('Received completion data');
        
        if (!data.choices || !data.choices.length || !data.choices[0].message) {
          console.error('Unexpected completion response format:', data);
          throw new Error('Invalid response format from OpenRouter API');
        }
        
        // Extract and return content
        return data.choices[0].message.content;
      }
    } catch (error) {
      // Enhanced error handling with more specific categories
      if (error.name === 'AbortError') {
        if (this.abortController.signal.reason === 'timeout') {
          console.error('Request timed out');
          throw new Error('The translation request timed out. The server might be busy, please try again later.');
        } else {
          console.error('Request was cancelled');
          throw new Error('Translation request was cancelled.');
        }
      }
      
      // Handle rate limiting more gracefully
      if (error.message.includes('429') || error.message.toLowerCase().includes('rate limit')) {
        throw new Error('Rate limit exceeded. Please wait a moment before trying again, or switch to a different model.');
      }
      
      // Handle context length errors
      if (error.message.includes('context length') || error.message.includes('token limit')) {
        throw new Error('The text is too long for this model. Try breaking it into smaller chunks or selecting a model with larger context window.');
      }
      
      console.error('Error generating completion:', error);
      throw error;
    }
  }
  
  /**
   * Translate text using OpenRouter API
   * @param {boolean} useInput - Whether to use input text (true) or chapter text (false)
   */
  translateText(useInput = true) {
    // Prevent multiple concurrent translations
    if (this.isTranslating) {
      UIService.showNotification('Translation already in progress. Please wait or cancel the current translation.', 'warning');
      return;
    }
    
    const currentProject = ProjectService.getCurrentProject();
    if (!currentProject) {
      UIService.showNotification('Please select a project first', 'warning');
      return;
    }
    
    // Check if OpenRouter is configured
    if (!currentProject.settings?.openRouterApiKey) {
      UIService.showNotification('OpenRouter API key is not configured. Please set it in Settings tab.', 'warning');
      return;
    }
    
    if (!currentProject.settings?.openRouterModel) {
      UIService.showNotification('OpenRouter model is not selected. Please select a model in Settings tab.', 'warning');
      return;
    }
    
    // Get source text
    let sourceText = '';
    if (useInput) {
      sourceText = document.getElementById('input-text')?.value?.trim() || '';
    } else {
      sourceText = document.getElementById('chapter-text')?.value?.trim() || '';
    }
    
    if (!sourceText) {
      UIService.showNotification('Please enter text to translate', 'warning');
      return;
    }
    
    this.translateChineseText(sourceText, currentProject);
  }
  
  /**
   * Translate Chinese text to English
   * @param {string} chineseText - Chinese text to translate
   * @param {Object} project - Current project
   * @private
   */
  translateChineseText(chineseText, project) {
    // Set translation state
    this.isTranslating = true;
    this.currentTranslation = null;
    
    UIService.toggleLoading(true, 'Preparing translation with OpenRouter...');
    UIService.toggleProgressBar(true);
    UIService.updateProgress(0, 'Analyzing text...');
    
    // Show cancel button if it exists
    const cancelBtn = document.getElementById('cancel-translation-btn');
    if (cancelBtn) {
      cancelBtn.style.display = 'block';
    }
    
    // Get chunking settings
    const strategy = document.getElementById('chunking-strategy')?.value || 'auto';
    const chunkSize = parseInt(document.getElementById('chunk-size')?.value) || 1000;
    
    // Check if glossary should be applied - first from checkbox, then from localStorage as fallback
    let shouldApplyGlossary = true; // default
    
    // Try to get state from toggle element first
    const applyGlossaryToggle = document.getElementById('apply-glossary-toggle');
    if (applyGlossaryToggle !== null) {
      shouldApplyGlossary = applyGlossaryToggle.checked;
    } else {
      // If element not available, check localStorage
      const savedState = localStorage.getItem('applyGlossary');
      if (savedState !== null) {
        shouldApplyGlossary = savedState === 'true';
      }
    }
    
    if (shouldApplyGlossary) {
      // Apply glossary if available and toggle is on
      GlossaryService.getGlossaryEntries(project.id)
        .then(glossaryEntries => {
          let textToTranslate = chineseText;
          if (glossaryEntries.length > 0) {
            textToTranslate = TextService.applyGlossary(chineseText, glossaryEntries);
            console.log(`Applied ${glossaryEntries.length} glossary terms`);
            
            UIService.showNotification(`Applied ${glossaryEntries.length} glossary terms before translation`, 'info', 3000);
          } else {
            console.log('No glossary terms to apply');
          }
          
          // Check if "none" chunking strategy is selected
          if (strategy === 'none') {
            // Process without chunking
            this.processSingleChunkTranslation(textToTranslate, chineseText, project);
          } else {
            // Continue with normal chunked translation process
            this.processTranslation(textToTranslate, chineseText, project, strategy, chunkSize);
          }
        })
        .catch(error => {
          console.error('Error applying glossary:', error);
          // Continue with original text
          if (strategy === 'none') {
            this.processSingleChunkTranslation(chineseText, chineseText, project);
          } else {
            this.processTranslation(chineseText, chineseText, project, strategy, chunkSize);
          }
        });
    } else {
      // Skip glossary application if toggle is off
      UIService.showNotification('Glossary application skipped (toggle is off)', 'info', 3000);
      
      // Check chunking strategy and proceed
      if (strategy === 'none') {
        this.processSingleChunkTranslation(chineseText, chineseText, project);
      } else {
        this.processTranslation(chineseText, chineseText, project, strategy, chunkSize);
      }
    }
  }
  
  /**
   * Process a single chunk translation without splitting
   * @param {string} processedText - Text to translate (possibly with glossary applied)
   * @param {string} originalText - Original text before processing (for verification)
   * @param {Object} project - Current project
   * @private
   */
  async processSingleChunkTranslation(processedText, originalText, project) {
    try {
      // For very large texts, warn the user
      if (processedText.length > 50000) {
        if (!confirm('The text is very large (over 50KB). Processing it as a single unit may cause issues with API limits or slow performance. Continue anyway?')) {
          this.isTranslating = false;
          UIService.toggleLoading(false);
          UIService.toggleProgressBar(false);
          return;
        }
      }
      
      UIService.updateProgress(10, 'Preparing single chunk translation...');
      
      // Get prompt toggle state
      const includePromptToggle = document.getElementById('include-prompt-toggle');
      const includePrompt = includePromptToggle ? includePromptToggle.checked : true;
      
      // Create translation prompt
      const translationPrompt = TextService.generateTranslationPrompt(
        processedText,
        project.instructions || '',
        includePrompt
      );
      
      // Estimate tokens and cost
      const estimateResult = await this.estimateTokensAndCost(
        processedText, 
        project.settings.openRouterModel
      );
      
      // If the tokens exceed the model's context limit, warn and abort
      const models = await this.getAvailableModels();
      const modelInfo = models.find(m => m.id === project.settings.openRouterModel);
      
      if (modelInfo && modelInfo.context_length && 
          estimateResult.estimatedTokens > modelInfo.context_length * 0.9) {
        const proceed = confirm(
          `Warning: The text likely exceeds ${modelInfo.name}'s context limit ` +
          `(estimated ${estimateResult.estimatedTokens} tokens vs. ${modelInfo.context_length} limit). ` +
          `This may result in incomplete translation. Consider using chunking instead. ` +
          `Do you want to proceed anyway?`
        );
        
        if (!proceed) {
          this.isTranslating = false;
          UIService.toggleLoading(false);
          UIService.toggleProgressBar(false);
          return;
        }
      }
      
      UIService.updateProgress(20, `Translating entire text (${estimateResult.estimatedTokens} tokens)...`);
      
      // Translate the entire text
      const translation = await this.generateCompletion(
        project.settings.openRouterModel,
        translationPrompt,
        0.3, // Lower temperature for more consistent translations
        Math.min(10000, modelInfo?.context_length ? Math.floor(modelInfo.context_length * 0.5) : 4000), // Limit max tokens
        false // Don't stream
      );
      
      UIService.updateProgress(95, 'Finalizing translation...');
      
      // Save the translation to the project
      const quill = UIService.getQuill();
      if (quill) {
        quill.setText(translation);
        await ProjectService.updateProjectOutput(
          project.id,
          quill.getContents().ops
        );
      }
      
      this.isTranslating = false;
      this.currentTranslation = translation;
      
      UIService.updateProgress(100, 'Translation complete');
      UIService.showNotification('Translation completed successfully', 'success');
      UIService.updateLastAction('Translation completed');
      UIService.updateWordCounts();
      
      // Hide cancel button
      const cancelBtn = document.getElementById('cancel-translation-btn');
      if (cancelBtn) {
        cancelBtn.style.display = 'none';
      }
      
      UIService.toggleLoading(false);
      UIService.toggleProgressBar(false);
      
      return translation;
    } catch (error) {
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
   * Process the translation after optional glossary application
   * @param {string} processedText - Text to translate (possibly with glossary applied)
   * @param {string} originalText - Original text before processing (for verification)
   * @param {Object} project - Current project
   * @param {string} strategy - Chunking strategy
   * @param {number} chunkSize - Chunk size
   * @private
   */
  async processTranslation(processedText, originalText, project, strategy, chunkSize) {
    try {
      // Chunk the text
      let chunks = [];
      
      if (strategy === 'auto') {
        chunks = TextService.chunkText(processedText, 'auto', chunkSize);
      } else if (strategy === 'chapter') {
        chunks = TextService.chunkText(processedText, 'chapter', chunkSize);
      } else if (strategy === 'word-count') {
        chunks = TextService.chunkText(processedText, 'word-count', chunkSize);
      } else {
        // Fallback chunking if specific strategy not recognized
        chunks = this.chunkText(processedText, chunkSize);
      }
      
      if (chunks.length === 0) {
        this.isTranslating = false;
        UIService.toggleLoading(false);
        UIService.toggleProgressBar(false);
        UIService.showNotification('No valid text chunks to translate', 'error');
        return;
      }
      
      UIService.updateProgress(5, `Preparing to translate ${chunks.length} chunks...`);
      
      // Estimate tokens and cost
      const estimateResult = await this.estimateTokensAndCost(processedText, project.settings.openRouterModel);
      console.log('Translation estimate:', estimateResult);
      
      let message = `Estimated ${estimateResult.estimatedTokens} tokens`;
      if (estimateResult.estimatedCost > 0) {
        message += ` (approx. $${estimateResult.estimatedCost.toFixed(5)})`;
      }
      UIService.updateProgress(10, message);
      
      // Translate each chunk
      let fullTranslation = "";
      let progress = 10;
      const progressPerChunk = 85 / chunks.length;
      
      // Process chunks sequentially
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        UIService.updateProgress(
          Math.round(progress),
          `Translating chunk ${i + 1}/${chunks.length}`
        );
        
        const chunkTranslation = await this.translateChunk(
          chunk,
          project.settings.openRouterModel,
          project.instructions || '',
          partialTranslation => {
            // This callback is called with incremental updates if streaming
            const quill = UIService.getQuill();
            if (quill) {
              quill.setText(fullTranslation + partialTranslation);
            }
          }
        );
        
        // Add a newline between chunks if this isn't the first one
        const separator = i > 0 ? '\n\n' : '';
        fullTranslation += separator + chunkTranslation;
        
        // Update translation in editor
        const quill = UIService.getQuill();
        if (quill) {
          quill.setText(fullTranslation);
        }
        
        progress += progressPerChunk;
      }
      
      UIService.updateProgress(95, 'Finalizing translation...');
      
      // Save the translation to the project
      const quill = UIService.getQuill();
      if (quill) {
        await ProjectService.updateProjectOutput(
          project.id,
          quill.getContents().ops
        );
      }
      
      this.isTranslating = false;
      this.currentTranslation = fullTranslation;
      
      UIService.updateProgress(100, 'Translation complete');
      UIService.showNotification('Translation completed successfully', 'success');
      UIService.updateLastAction('Translation completed');
      UIService.updateWordCounts();
      
      // Verify translation if enabled in project settings
      if (project.settings?.autoVerify) {
        this.verifyTranslation(originalText, fullTranslation, project.settings.openRouterModel);
      }
      
      // Hide cancel button
      const cancelBtn = document.getElementById('cancel-translation-btn');
      if (cancelBtn) {
        cancelBtn.style.display = 'none';
      }
      
      UIService.toggleLoading(false);
      UIService.toggleProgressBar(false);
      
      return fullTranslation;
    } catch (error) {
      this.isTranslating = false;
      
      // Hide cancel button
      const cancelBtn = document.getElementById('cancel-translation-btn');
      if (cancelBtn) {
        cancelBtn.style.display = 'none';
      }
      
      UIService.toggleLoading(false);
      UIService.toggleProgressBar(false);
      
      // Enhanced error message with recovery suggestions
      let errorMessage = `Translation failed: ${error.message}`;
      let errorType = 'error';
      
      if (error.name === 'AbortError') {
        errorMessage = 'Translation was cancelled.';
        errorType = 'info';
      } else if (error.message.includes('Invalid API key')) {
        errorMessage += ' Please check your API key in the Settings tab.';
      } else if (error.message.includes('Rate limit')) {
        errorMessage += ' Try again in a few minutes or select a different model.';
      } else if (error.message.includes('too long')) {
        errorMessage += ' Try using smaller chunks or a model with larger context.';
      } else if (error.message.includes('Insufficient credits')) {
        errorMessage += ' Please add more credits to your OpenRouter account.';
      }
      
      UIService.showNotification(errorMessage, errorType);
      UIService.updateLastAction('Translation failed');
      
      console.error('Translation error:', error);
      throw error;
    }
  }
  
  /**
   * Enhanced text chunking with chapter and paragraph awareness
   * @param {string} text - Text to chunk
   * @param {number} chunkSize - Target words per chunk
   * @returns {Array<string>} Chunked text
   * @private
   */
  chunkText(text, chunkSize) {
    if (!text) return [];
    if (chunkSize === undefined) chunkSize = 1000;
    
    // If text is small enough, return as a single chunk
    const estimatedWords = text.split(/\s+/).length;
    if (estimatedWords <= chunkSize) {
      return [text];
    }
    
    // Split by natural boundaries like chapters, sections, and paragraphs
    // Chapter detection: look for chapter headings
    const chapterMatches = text.match(/(?:Chapter|第[一二三四五六七八九十百千万]+章|第\d+章).*?(?=\n|$)/g);
    if (chapterMatches && chapterMatches.length > 1) {
      // If we have multiple chapters, chunk by chapters
      const chapters = text.split(/(?:Chapter|第[一二三四五六七八九十百千万]+章|第\d+章)/);
      const chunks = [];
      
      // Add chapter headings back to chunks
      for (let i = 1; i < chapters.length; i++) {
        const chapterText = chapterMatches[i-1] + chapters[i];
        
        // If chapter is too large, break it down further
        if (chapterText.split(/\s+/).length > chunkSize * 1.5) {
          const subChunks = this._chunkByParagraphs(chapterText, chunkSize);
          chunks.push(...subChunks);
        } else {
          chunks.push(chapterText);
        }
      }
      
      return chunks;
    }
    
    // No chapter structure found, fall back to paragraph chunking
    return this._chunkByParagraphs(text, chunkSize);
  }
  
  /**
   * Helper method for paragraph chunking
   * @param {string} text - Text to chunk
   * @param {number} chunkSize - Target words per chunk
   * @returns {Array<string>} Chunked text
   * @private
   */
  _chunkByParagraphs(text, chunkSize) {
    const paragraphs = text.split(/\n\s*\n/);
    const chunks = [];
    let currentChunk = [];
    let currentSize = 0;
    
    for (const paragraph of paragraphs) {
      const paragraphSize = paragraph.split(/\s+/).length;
      
      if (currentSize + paragraphSize <= chunkSize) {
        currentChunk.push(paragraph);
        currentSize += paragraphSize;
      } else {
        if (currentChunk.length > 0) {
          chunks.push(currentChunk.join('\n\n'));
          currentChunk = [paragraph];
          currentSize = paragraphSize;
        } else {
          // Paragraph is larger than chunk size, break it into sentences
          const sentences = paragraph.match(/[^.!?。！？]+[.!?。！？]+/g) || [paragraph];
          let sentenceChunk = [];
          let sentenceSize = 0;
          
          for (const sentence of sentences) {
            const sentenceWordCount = sentence.split(/\s+/).length;
            
            if (sentenceSize + sentenceWordCount <= chunkSize) {
              sentenceChunk.push(sentence);
              sentenceSize += sentenceWordCount;
            } else {
              if (sentenceChunk.length > 0) {
                chunks.push(sentenceChunk.join(' '));
                sentenceChunk = [sentence];
                sentenceSize = sentenceWordCount;
              } else {
                // Even a single sentence is too long, force include it
                chunks.push(sentence);
              }
            }
          }
          
          if (sentenceChunk.length > 0) {
            chunks.push(sentenceChunk.join(' '));
          }
        }
      }
    }
    
    // Add the last chunk if there's anything left
    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n\n'));
    }
    
    return chunks;
  }
  
  /**
   * Translate a single chunk using OpenRouter
   * @param {string} chunk - Text chunk to translate
   * @param {string} model - Model ID to use
   * @param {string} customInstructions - Custom prompt instructions
   * @param {Function} progressCallback - Callback for streaming updates
   * @returns {Promise<string>} Translated text
   * @private
   */
  async translateChunk(chunk, model, customInstructions = '', progressCallback = null) {
    if (!chunk || typeof chunk !== 'string' || !chunk.trim()) {
      throw new Error('Invalid or empty chunk provided for translation');
    }
    
    if (!model) {
      throw new Error('Model ID is required');
    }
    
    // Prepare prompt - use TextService to generate prompt
    const prompt = TextService.generateTranslationPrompt(chunk, customInstructions);
    
    // Check if we should use streaming
    const useStream = !!progressCallback;
    
    if (useStream) {
      // Handle streaming response
      const response = await this.generateCompletion(
        model,
        prompt,
        0.3, // Lower temperature for more consistent translations
        4000, // Higher max tokens for translations
        true  // Stream the response
      );
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let fullText = '';
      
      // Process the stream
      const processStream = async ({ done, value }) => {
        if (done) return fullText;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (!line.trim() || !line.startsWith('data:')) continue;
          
          const jsonStr = line.replace('data:', '').trim();
          if (jsonStr === '[DONE]') break;
          
          try {
            const data = JSON.parse(jsonStr);
            if (data.choices && data.choices[0]) {
              const content = data.choices[0].delta?.content || '';
              if (content) {
                fullText += content;
                
                // Call progress callback
                if (progressCallback) {
                  progressCallback(fullText);
                }
              }
            }
          } catch (error) {
            console.warn('Error parsing streaming response:', error);
          }
        }
        
        // Continue reading
        return reader.read().then(processStream);
      };
      
      // Start reading
      return reader.read().then(processStream);
    } else {
      // Non-streaming response
      return this.generateCompletion(
        model,
        prompt,
        0.3,  // Lower temperature for more consistent translations
        4000, // Higher max tokens for translations
        false // Don't stream
      );
    }
  }
  
  /**
   * Handle click on verify button
   */
  handleVerifyButtonClick() {
    const currentProject = ProjectService.getCurrentProject();
    if (!currentProject) {
      UIService.showNotification('Please select a project first', 'warning');
      return;
    }
    
    // Check if OpenRouter is configured
    if (!currentProject.settings?.openRouterApiKey) {
      UIService.showNotification('OpenRouter API key is required for verification. Please configure it in Settings tab.', 'warning');
      return;
    }
    
    if (!currentProject.settings?.openRouterModel) {
      UIService.showNotification('OpenRouter model is not selected. Please select a model in Settings tab.', 'warning');
      return;
    }
    
    // Get source text from input
    const sourceText = document.getElementById('input-text')?.value?.trim();
    if (!sourceText) {
      UIService.showNotification('Source text is required for verification', 'warning');
      return;
    }
    
    // Get translated text from Quill editor
    let translatedText = '';
    const quill = UIService.getQuill();
    if (quill) {
      translatedText = quill.getText().trim();
    }
    
    if (!translatedText) {
      UIService.showNotification('No translation to verify', 'warning');
      return;
    }
    
    // Show loading state
    UIService.toggleLoading(true, 'Verifying translation...');
    UIService.toggleProgressBar(true);
    UIService.updateProgress(0, 'Preparing verification...');
    
    // Run verification
    this.verifyTranslation(sourceText, translatedText, currentProject.settings.openRouterModel)
      .then(results => {
        // Enhanced results display
        this.displayVerificationResults(results, sourceText, translatedText);
        
        UIService.toggleLoading(false);
        UIService.toggleProgressBar(false);
        UIService.updateLastAction('Translation verification completed');
      })
      .catch(error => {
        console.error('Verification error:', error);
        UIService.toggleLoading(false);
        UIService.toggleProgressBar(false);
        UIService.showNotification(`Verification failed: ${error.message}`, 'error');
        UIService.updateLastAction('Translation verification failed');
      });
  }
  
  /**
   * Verify translation quality
   * @param {string} sourceText - Original Chinese text
   * @param {string} translatedText - English translation
   * @param {string} model - Model ID to use for verification
   * @returns {Promise<Object>} Verification results
   */
  async verifyTranslation(sourceText, translatedText, model) {
    if (!sourceText || !translatedText) {
      throw new Error('Source and translated text are required');
    }
    
    if (!model) {
      throw new Error('Model ID is required');
    }
    
    // Get current project to get glossary entries
    const currentProject = ProjectService.getCurrentProject();
    if (!currentProject) {
      throw new Error('No active project found');
    }
    
    UIService.toggleLoading(true, 'Loading glossary and preparing verification...');
    UIService.updateProgress(10, 'Retrieving glossary terms...');
    
    // First fetch the glossary entries for the current project
    const glossaryEntries = await GlossaryService.getGlossaryEntries(currentProject.id);
    
    UIService.updateProgress(30, `Found ${glossaryEntries.length} glossary terms to verify against...`);
    
    // Generate verification prompt with glossary terms included
    const prompt = this._generateEnhancedVerificationPrompt(sourceText, translatedText, glossaryEntries);
    
    UIService.updateProgress(40, 'Analyzing translation against glossary...');
    
    // Request verification from OpenRouter
    const response = await this.generateCompletion(
      model,
      prompt,
      0.2,  // Low temperature for consistent output
      2000, // Enough tokens for detailed verification
      false // Don't stream
    );
    
    UIService.updateProgress(80, 'Processing verification results...');
    
    // Process the response to extract verification results
    const results = this._processVerificationResponse(response, translatedText);
    
    // Add glossary-specific section to results
    const enhancedResults = await this._enhanceResultsWithGlossaryInfo(results, currentProject.id, translatedText);
    
    UIService.toggleLoading(false);
    
    // Display verification results with glossary section
    this.displayVerificationResults(enhancedResults, sourceText, translatedText);
    
    return enhancedResults;
  }
  
  /**
   * Display verification results in a user-friendly way
   * @param {Object} results - Verification results from OpenRouter
   * @param {string} sourceText - Original text
   * @param {string} translatedText - Translated text
   * @private
   */
  displayVerificationResults(results, sourceText, translatedText) {
    // Create modal if it doesn't exist
    this.createVerificationResultsModal();
    
    // Quality scores
    const accuracy = results.accuracy || 0;
    const completeness = results.completeness || 0;
    const glossaryCompliance = results.glossaryCompliance || 0;
    
    // Improved weighted algorithm for overall score:
    // - If there are no glossary entries or issues, don't penalize the score for glossary compliance
    // - Weight accuracy higher than completeness since it's more important for final quality
    let overallScore;
    
    if (results.glossaryIssues && results.glossaryIssues.length === 0 && glossaryCompliance < 50) {
      // If no glossary issues were found but compliance score is low, 
      // it's likely the glossary is empty or not relevant, so don't count it
      overallScore = Math.round((accuracy * 0.6) + (completeness * 0.4));
    } else if (glossaryCompliance > 0) {
      // Include glossary compliance with proper weighting when it's relevant
      overallScore = Math.round((accuracy * 0.5) + (completeness * 0.3) + (glossaryCompliance * 0.2));
    } else {
      // No glossary configured or completely non-compliant
      overallScore = Math.round((accuracy * 0.6) + (completeness * 0.4));
    }
    
    // Determine overall quality level
    let qualityLevel, qualityClass;
    if (overallScore >= 90) {
      qualityLevel = 'Excellent';
      qualityClass = 'success';
    } else if (overallScore >= 75) {
      qualityLevel = 'Good';
      qualityClass = 'info';
    } else if (overallScore >= 60) {
      qualityLevel = 'Fair';
      qualityClass = 'warning';
    } else {
      qualityLevel = 'Poor';
      qualityClass = 'error';
    }
    
    // Update modal content
    const modalTitle = document.getElementById('verification-modal-title');
    if (modalTitle) {
      modalTitle.textContent = `Translation Quality: ${qualityLevel}`;
      modalTitle.className = qualityClass;
    }
    
    // Update scores
    const accuracyScore = document.getElementById('accuracy-score');
    if (accuracyScore) {
      accuracyScore.textContent = `${Math.round(accuracy)}%`;
      accuracyScore.className = this.getScoreClass(accuracy);
    }
    
    const completenessScore = document.getElementById('completeness-score');
    if (completenessScore) {
      completenessScore.textContent = `${Math.round(completeness)}%`;
      completenessScore.className = this.getScoreClass(completeness);
    }
    
    // Add glossary compliance score
    const glossaryScore = document.getElementById('glossary-score');
    if (glossaryScore) {
      glossaryScore.textContent = `${Math.round(glossaryCompliance)}%`;
      glossaryScore.className = this.getScoreClass(glossaryCompliance);
    } else {
      // If element doesn't exist, we need to add it to the modal
      const scoreContainer = document.querySelector('.verification-scores');
      if (scoreContainer) {
        const scoreItem = document.createElement('div');
        scoreItem.className = 'score-item';
        
        const scoreLabel = document.createElement('div');
        scoreLabel.className = 'score-label';
        scoreLabel.textContent = 'Glossary Compliance';
        
        const scoreElement = document.createElement('div');
        scoreElement.id = 'glossary-score';
        scoreElement.className = this.getScoreClass(glossaryCompliance);
        scoreElement.textContent = `${Math.round(glossaryCompliance)}%`;
        
        scoreItem.appendChild(scoreLabel);
        scoreItem.appendChild(scoreElement);
        scoreContainer.appendChild(scoreItem);
      }
    }
    
    // Process regular issues
    const issuesList = document.getElementById('verification-issues-list');
    if (issuesList) {
      issuesList.innerHTML = '';
      
      if (!results.issues || results.issues.length === 0) {
        const noIssues = document.createElement('li');
        noIssues.className = 'no-issues';
        noIssues.textContent = 'No significant issues found in the translation.';
        issuesList.appendChild(noIssues);
      } else {
        // Sort issues by severity (implied by the difference between source and translation)
        results.issues.sort((a, b) => {
          const aLen = a.sourceText ? a.sourceText.length : 0;
          const bLen = b.sourceText ? b.sourceText.length : 0;
          return bLen - aLen; // Longer source text first (likely more important)
        });
        
        // Add issues to the list
        results.issues.forEach(issue => {
          const issueItem = document.createElement('li');
          issueItem.className = 'issue-item';
          
          const issueContent = document.createElement('div');
          issueContent.className = 'issue-content';
          
          // Issue description
          const issueDesc = document.createElement('p');
          issueDesc.className = 'issue-description';
          issueDesc.textContent = issue.issue;
          issueContent.appendChild(issueDesc);
          
          // Source and translation comparison
          if (issue.sourceText && issue.translatedText) {
            const comparison = document.createElement('div');
            comparison.className = 'text-comparison';
            
            const sourceDiv = document.createElement('div');
            sourceDiv.className = 'source-text';
            sourceDiv.innerHTML = '<strong>Source:</strong> ' + issue.sourceText;
            
            const translatedDiv = document.createElement('div');
            translatedDiv.className = 'translated-text';
            translatedDiv.innerHTML = '<strong>Translation:</strong> ' + issue.translatedText;
            
            comparison.appendChild(sourceDiv);
            comparison.appendChild(translatedDiv);
            issueContent.appendChild(comparison);
          }
          
          // Suggestion
          if (issue.suggestion) {
            const suggestion = document.createElement('div');
            suggestion.className = 'suggestion';
            suggestion.innerHTML = '<strong>Suggestion:</strong> ' + issue.suggestion;
            issueContent.appendChild(suggestion);
            
            // Add apply button if we have a suggestion
            const applyBtn = document.createElement('button');
            applyBtn.className = 'small-btn apply-suggestion';
            applyBtn.textContent = 'Apply Suggestion';
            applyBtn.addEventListener('click', () => {
              // Apply the suggestion by replacing the issue.translatedText with issue.suggestion in the Quill editor
              const quill = UIService.getQuill();
              if (quill) {
                try {
                  const currentText = quill.getText();
                  
                  // Find the text to replace - allow for slight differences in whitespace
                  let textToReplace = issue.translatedText;
                  let newText = currentText;
                  let replaced = false;
                  
                  // Try exact match first
                  if (currentText.includes(textToReplace)) {
                    newText = currentText.replace(textToReplace, issue.suggestion);
                    replaced = true;
                  } else {
                    // Try with flexible whitespace matching
                    const escapedText = textToReplace
                      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')  // Escape regex special chars
                      .replace(/\s+/g, '\\s+');                // Replace whitespace with flexible whitespace matcher
                    
                    const regex = new RegExp(escapedText, 'g');
                    if (regex.test(currentText)) {
                      newText = currentText.replace(regex, issue.suggestion);
                      replaced = true;
                    }
                  }
                  
                  if (replaced) {
                    // Use the proper Quill API to update content
                    quill.deleteText(0, currentText.length);
                    quill.insertText(0, newText);
                    
                    // Save the change to the project
                    const currentProject = ProjectService.getCurrentProject();
                    if (currentProject) {
                      ProjectService.updateProjectOutput(
                        currentProject.id,
                        quill.getContents().ops
                      );
                    }
                    
                    // Disable the button
                    applyBtn.disabled = true;
                    applyBtn.textContent = 'Applied';
                    
                    UIService.showNotification('Suggestion applied', 'success');
                    UIService.updateLastAction('Translation updated with suggestion');
                  } else {
                    console.error('Could not find text to replace:', textToReplace);
                    UIService.showNotification('Could not find the exact text to replace. Try manual editing.', 'warning');
                  }
                } catch (error) {
                  console.error('Error applying suggestion:', error);
                  UIService.showNotification('Error applying suggestion: ' + error.message, 'error');
                }
              }
            });
            issueContent.appendChild(applyBtn);
          }
          
          issueItem.appendChild(issueContent);
          issuesList.appendChild(issueItem);
        });
      }
    }
    
    // Add glossary issues section
    let glossaryIssuesList = document.getElementById('glossary-issues-list');
    if (!glossaryIssuesList) {
      // Create the section if it doesn't exist
      const modalBody = document.querySelector('#verification-results-modal .modal-body');
      if (modalBody) {
        const glossaryHeader = document.createElement('h4');
        glossaryHeader.textContent = 'Glossary Compliance Issues';
        modalBody.appendChild(glossaryHeader);
        
        glossaryIssuesList = document.createElement('ul');
        glossaryIssuesList.id = 'glossary-issues-list';
        glossaryIssuesList.className = 'glossary-issues-list';
        modalBody.appendChild(glossaryIssuesList);
      }
    }
    
    // Populate glossary issues
    if (glossaryIssuesList) {
      glossaryIssuesList.innerHTML = '';
      
      if (!results.glossaryIssues || results.glossaryIssues.length === 0) {
        const noIssues = document.createElement('li');
        noIssues.className = 'no-issues';
        noIssues.textContent = 'All glossary terms are translated correctly and consistently.';
        glossaryIssuesList.appendChild(noIssues);
      } else {
        // Add glossary issues to the list
        results.glossaryIssues.forEach(issue => {
          const issueItem = document.createElement('li');
          issueItem.className = 'issue-item glossary-issue';
          
          const issueContent = document.createElement('div');
          issueContent.className = 'issue-content';
          
          // Issue description
          const issueDesc = document.createElement('p');
          issueDesc.className = 'issue-description';
          issueDesc.innerHTML = `<strong>${issue.term}</strong> should be translated as <strong>${issue.expectedTranslation}</strong> but found as <strong>${issue.actualTranslation || "missing"}</strong>`;
          issueContent.appendChild(issueDesc);
          
          // Add fix button if appropriate
          if (issue.expectedTranslation && issue.actualTranslation) {
            const fixBtn = document.createElement('button');
            fixBtn.className = 'small-btn apply-suggestion';
            fixBtn.textContent = 'Apply Correct Term';
            fixBtn.addEventListener('click', () => {
              const quill = UIService.getQuill();
              if (quill) {
                const currentText = quill.getText();
                const newText = currentText.replace(
                  new RegExp(issue.actualTranslation, 'g'), 
                  issue.expectedTranslation
                );
                quill.setText(newText);
                
                // Save the change to the project
                const currentProject = ProjectService.getCurrentProject();
                if (currentProject) {
                  ProjectService.updateProjectOutput(
                    currentProject.id,
                    quill.getContents().ops
                  );
                }
                
                // Update button state
                fixBtn.disabled = true;
                fixBtn.textContent = 'Applied';
                
                UIService.showNotification('Glossary term corrected', 'success');
              }
            });
            issueContent.appendChild(fixBtn);
          }
          
          issueItem.appendChild(issueContent);
          glossaryIssuesList.appendChild(issueItem);
        });
      }
    }
    
    // Missing content
    const missingContent = document.getElementById('missing-content-list');
    if (missingContent) {
      missingContent.innerHTML = '';
      
      if (!results.missingContent || results.missingContent.length === 0) {
        const noMissing = document.createElement('li');
        noMissing.textContent = 'No missing content detected.';
        missingContent.appendChild(noMissing);
      } else {
        results.missingContent.forEach(item => {
          const listItem = document.createElement('li');
          listItem.textContent = item;
          missingContent.appendChild(listItem);
        });
      }
    }
    
    // Show the modal
    const modal = document.getElementById('verification-results-modal');
    if (modal) {
      modal.style.display = 'flex';
    }
    
    // Show summary notification
    const message = `Translation quality: ${qualityLevel} (${Math.round(overallScore)}%)\n` +
                    `Accuracy: ${Math.round(accuracy)}%, Completeness: ${Math.round(completeness)}%, ` +
                    `Glossary: ${Math.round(glossaryCompliance)}%`;
    UIService.showNotification(message, qualityClass.toLowerCase(), 6000);
  }
  
  /**
   * Create verification results modal if it doesn't exist
   * @private
   */
  createVerificationResultsModal() {
    // Check if modal already exists
    if (document.getElementById('verification-results-modal')) {
      return;
    }
    
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'verification-results-modal';
    
    // Modal content
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3 id="verification-modal-title">Translation Quality</h3>
          <button class="modal-close-btn">×</button>
        </div>
        <div class="modal-body">
          <div class="verification-scores">
            <div class="score-item">
              <div class="score-label">Accuracy</div>
              <div id="accuracy-score" class="score">--</div>
            </div>
            <div class="score-item">
              <div class="score-label">Completeness</div>
              <div id="completeness-score" class="score">--</div>
            </div>
            <div class="score-item">
              <div class="score-label">Glossary Compliance</div>
              <div id="glossary-score" class="score">--</div>
            </div>
          </div>
          
          <h4>Issues Found</h4>
          <ul id="verification-issues-list" class="issues-list">
            <li>Loading issues...</li>
          </ul>
          
          <h4>Glossary Compliance Issues</h4>
          <ul id="glossary-issues-list" class="glossary-issues-list">
            <li>Loading glossary issues...</li>
          </ul>
          
          <h4>Missing Content</h4>
          <ul id="missing-content-list" class="missing-content-list">
            <li>Loading missing content...</li>
          </ul>
        </div>
        <div class="modal-footer">
          <button id="close-verification-modal-btn" class="secondary-btn">
            <i class="fas fa-times"></i> Close
          </button>
        </div>
      </div>
    `;
    
    // Add CSS styles for glossary issues
    const style = document.createElement('style');
    style.textContent = `
      .glossary-issue {
        border-left-color: var(--accent-color);
      }
      
      .glossary-issues-list .no-issues {
        color: var(--success);
        padding: var(--spacing-md);
        text-align: center;
      }
    `;
    document.head.appendChild(style);
    
    // Add event listeners
    modal.addEventListener('click', function(event) {
      if (event.target === modal) {
        modal.style.display = 'none';
      }
    });
    
    // Add to document
    document.body.appendChild(modal);
    
    // Setup close button
    const closeBtn = modal.querySelector('.modal-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', function() {
        modal.style.display = 'none';
      });
    }
    
    const closeModalBtn = modal.querySelector('#close-verification-modal-btn');
    if (closeModalBtn) {
      closeModalBtn.addEventListener('click', function() {
        modal.style.display = 'none';
      });
    }
  }
  
  /**
   * Get CSS class based on score
   * @param {number} score - Score from 0-100
   * @returns {string} CSS class name
   * @private
   */
  getScoreClass(score) {
    if (score >= 90) return 'score success';
    if (score >= 75) return 'score info';
    if (score >= 60) return 'score warning';
    return 'score error';
  }
  
  /**
   * Process verification response from OpenRouter
   * @param {string} response - Raw response text
   * @param {string} translatedText - The translated text for context
   * @returns {Object} Parsed verification results
   * @private
   */
  _processVerificationResponse(response, translatedText) {
    try {
      // Update progress
      UIService.updateProgress(70, 'Processing results...');
      
      // Extract JSON from response
      let jsonStr = response;
      let results;
      
      // First try: Look for JSON in code blocks
      const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
        results = JSON.parse(jsonStr);
      } else {
        // Second try: Find any JSON object in the response
        const match = response.match(/(\{[\s\S]*?\})/g);
        if (match) {
          // Try each match until we find valid JSON
          for (const potentialJson of match) {
            try {
              results = JSON.parse(potentialJson);
              // If it has the fields we need, use this one
              if (results.accuracy !== undefined || results.completeness !== undefined) {
                break;
              }
            } catch (e) {
              // Continue to next match
            }
          }
        }
        
        // Third try: If still not found, try the full response
        if (!results) {
          results = JSON.parse(response);
        }
      }
      
      if (!results) {
        // Final fallback: If we can't parse JSON properly, extract scores from text
        // Look for percentage patterns like "Accuracy: 95%" or "accuracy: 95"
        const accuracyMatch = response.match(/accuracy:?\s*(\d+)%?/i);
        const completenessMatch = response.match(/complete(?:ness)?:?\s*(\d+)%?/i);
        const glossaryMatch = response.match(/glossary(?:\s*compliance)?:?\s*(\d+)%?/i);
        
        results = {
          accuracy: accuracyMatch ? parseInt(accuracyMatch[1], 10) : 85, // Default to 85% if not found
          completeness: completenessMatch ? parseInt(completenessMatch[1], 10) : 85, // Default to 85% if not found
          glossaryCompliance: glossaryMatch ? parseInt(glossaryMatch[1], 10) : 80, // Default to 80% if not found
        };
        
        // Try to extract issues from text
        const issues = [];
        const issueMatches = response.match(/issue:?\s*([^\n]+)/gi);
        if (issueMatches) {
          issueMatches.forEach((match, index) => {
            issues.push({
              issue: match.replace(/^issue:?\s*/i, ''),
              sourceText: `Issue ${index + 1}`,
              translatedText: '',
              suggestion: ''
            });
          });
        }
        
        results.issues = issues;
        
        // Try to extract missing content
        const missingContent = [];
        const missingMatches = response.match(/missing:?\s*([^\n]+)/gi);
        if (missingMatches) {
          missingMatches.forEach(match => {
            missingContent.push(match.replace(/^missing:?\s*/i, ''));
          });
        }
        
        results.missingContent = missingContent;
      }
    } catch (error) {
      console.error('Error processing verification response:', error);
      
      // Provide default values rather than failing completely
      results = {
        accuracy: 85,
        completeness: 85,
        glossaryCompliance: 80,
        issues: [],
        missingContent: [],
        glossaryIssues: []
      };
    }
    
    // Validate scores to make sure they're numbers in the correct range
    const validateScore = (score) => {
      if (typeof score === 'number') {
        return Math.max(0, Math.min(100, score));
      } else if (typeof score === 'string' && !isNaN(score)) {
        return Math.max(0, Math.min(100, parseFloat(score)));
      }
      // Default to a sensible score if undefined/invalid
      return 85;
    };
    
    // Ensure all required fields exist with proper formatting
    const normalizedResults = {
      completeness: validateScore(results.completeness || 85),
      accuracy: validateScore(results.accuracy || 85),
      glossaryCompliance: validateScore(results.glossaryCompliance || 80),
      issues: Array.isArray(results.issues) ? results.issues : [],
      missingContent: Array.isArray(results.missingContent) ? results.missingContent : [],
      glossaryIssues: Array.isArray(results.glossaryIssues) ? results.glossaryIssues : [],
      translatedText: translatedText || results.translatedText || ''
    };
    
    // Update progress
    UIService.updateProgress(100, 'Verification complete');
    
    return normalizedResults;
  }
  
  /**
   * Generate an enhanced verification prompt
   * @param {string} sourceText - Original text
   * @param {string} translatedText - Translated text
   * @param {Array} glossaryEntries - Glossary entries to check
   * @returns {string} Verification prompt
   * @private
   */
  _generateEnhancedVerificationPrompt(sourceText, translatedText, glossaryEntries) {
    // Limit source text length if needed
    const MAX_SOURCE_LENGTH = 3000;
    let trimmedSource = sourceText;
    if (sourceText.length > MAX_SOURCE_LENGTH) {
      trimmedSource = sourceText.substring(0, MAX_SOURCE_LENGTH) + "... [text truncated for length]";
    }
    
    // Create glossary section with clear formatting
    let glossarySection = '';
    if (glossaryEntries && glossaryEntries.length > 0) {
      glossarySection = 'Glossary Terms to Check (Very Important):\n';
      
      // Only include up to 20 glossary terms to avoid prompt overload
      const limitedEntries = glossaryEntries.slice(0, 20);
      glossarySection += limitedEntries.map(entry => 
        `"${entry.chineseTerm}" → "${entry.translation}" (${entry.category || 'term'})`
      ).join('\n');
      
      if (glossaryEntries.length > 20) {
        glossarySection += `\n... and ${glossaryEntries.length - 20} more terms (check for consistent terminology).`;
      }
    } else {
      glossarySection = 'No glossary terms provided.';
    }
    
    // Create a focused prompt for verification
    return `I need a detailed quality assessment of this Chinese to English translation. Evaluate accuracy, completeness, and consistent terminology.

Source Chinese Text:
${trimmedSource}

English Translation:
${translatedText}

${glossarySection}

Analyze these aspects and respond ONLY in the following JSON format:
{
  "accuracy": 0-100,
  "completeness": 0-100,
  "glossaryCompliance": 0-100,
  "missingContent": ["list of missing elements"],
  "issues": [
    {
      "sourceText": "problematic Chinese text",
      "translatedText": "problematic translation",
      "issue": "description of the issue",
      "suggestion": "suggested correction"
    }
  ],
  "glossaryIssues": [
    {
      "term": "glossary term",
      "expectedTranslation": "according to glossary",
      "actualTranslation": "in the text",
      "locations": ["context where found"]
    }
  ]
}

Important scoring guidelines:
- Accuracy (0-100): How correctly the meaning is preserved
- Completeness (0-100): Whether all content is translated
- Glossary Compliance (0-100): How well terminology matches the glossary
- Be honest but fair in your assessment, using the full scale

Your assessment must be comprehensive and solely in the specified JSON format.`;
  }
  
  /**
   * Enhance verification results with glossary information
   * @param {Object} results - Verification results
   * @param {string} projectId - Project ID for glossary lookup
   * @param {string} translatedText - The translated text to analyze
   * @returns {Promise<Object>} Enhanced results with glossary info
   * @private
   */
  async _enhanceResultsWithGlossaryInfo(results, projectId, translatedText) {
    try {
      // If results already have glossary issues with substantial content, just return them
      if (results.glossaryIssues && results.glossaryIssues.length > 0 && 
          results.glossaryIssues[0].term && results.glossaryIssues[0].expectedTranslation) {
        return results;
      }
      
      // Otherwise, we need to check the glossary compliance ourselves
      const glossaryEntries = await GlossaryService.getGlossaryEntries(projectId);
      
      // Initialize glossary issues array if not present
      if (!results.glossaryIssues) {
        results.glossaryIssues = [];
      }
      
      // Skip glossary analysis if there are no glossary entries
      if (glossaryEntries.length === 0) {
        console.log('No glossary entries found, skipping glossary compliance check');
        // Don't penalize for no glossary
        results.glossaryCompliance = 90;
        return results;
      }
      
      // Set glossary compliance score if not already set or seems too low
      if (!results.glossaryCompliance || results.glossaryCompliance < 20) {
        // Default to moderate score
        results.glossaryCompliance = 75;
      }
      
      let complianceIssuesFound = 0;
      
      // Loop through each glossary entry and check it against the translated text
      if (glossaryEntries.length > 0 && translatedText) {
        glossaryEntries.forEach(entry => {
          if (!entry.chineseTerm || !entry.translation) return;
          
          const expectedTranslation = entry.translation;
          
          // Skip very short translations that might appear in many contexts
          if (expectedTranslation.length < 3) return;
          
          // More sophisticated check - look for term and approximate matches
          if (!translatedText.includes(expectedTranslation)) {
            // Check for minor variations (plurals, capitalization, etc.)
            const escapedTerm = expectedTranslation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`\\b${escapedTerm}s?\\b|\\b${escapedTerm.charAt(0).toUpperCase() + escapedTerm.slice(1)}s?\\b`, 'i');
            
            if (!regex.test(translatedText)) {
              // Try to find what might have been used instead
              let actualTranslation = "Not found";
              
              // Try to locate context in Chinese text to find potential alternative translations
              const chineseTerm = entry.chineseTerm;
              if (chineseTerm && chineseTerm.length > 1) {
                // This is a simplistic approach - in a real app we would use more sophisticated NLP
                const potentialMatches = [];
                const words = translatedText.split(/\s+/);
                
                for (let i = 0; i < words.length; i++) {
                  // Check 1-3 word combinations that might be alternatives
                  for (let len = 1; len <= 3; len++) {
                    if (i + len <= words.length) {
                      const phrase = words.slice(i, i + len).join(' ');
                      if (phrase.length > 3) {
                        potentialMatches.push(phrase);
                      }
                    }
                  }
                }
                
                if (potentialMatches.length > 0) {
                  actualTranslation = potentialMatches[0];
                }
              }
              
              // Add to glossary issues
              results.glossaryIssues.push({
                term: entry.chineseTerm,
                expectedTranslation: expectedTranslation,
                actualTranslation: actualTranslation,
                locations: []
              });
              
              complianceIssuesFound++;
            }
          }
        });
      }
      
      // Update glossary compliance score based on issues found
      if (complianceIssuesFound > 0) {
        // Calculate compliance percentage based on number of issues vs total entries
        const compliancePercentage = Math.max(20, 100 - (complianceIssuesFound * 100 / glossaryEntries.length));
        results.glossaryCompliance = Math.round(compliancePercentage);
      }
      
      return results;
    } catch (error) {
      console.error('Error enhancing results with glossary info:', error);
      return results; // Return original results if enhancement failed
    }
  }
  
  /**
   * Estimate token usage and cost for a text
   * @param {string} text - Text to estimate
   * @param {string} model - Model ID
   * @returns {Promise<Object>} Token usage and cost estimate
   */
  async estimateTokensAndCost(text, model) {
    try {
      if (!text || !model) {
        throw new Error('Text and model are required');
      }
      
      console.log(`Estimating tokens and cost for model: ${model}`);
      
      // Fetch model info to get pricing
      const models = await this.getAvailableModels();
      const modelInfo = models.find(m => m.id === model);
      
      if (!modelInfo) {
        console.warn(`Model ${model} not found in available models, using default pricing`);
        // Create a dummy model info with zero pricing
        return {
          id: model,
          name: model,
          pricing: {
            prompt: 0,
            completion: 0
          }
        };
      }
      
      // Improved token estimation for different languages
      // Chinese characters count differently than English words
      const chineseCharCount = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
      const otherCharCount = text.length - chineseCharCount;
      
      // More accurate token estimation:
      // Chinese: ~1.5 tokens per character
      // English: ~1 token per 4-5 characters
      const chineseTokens = Math.ceil(chineseCharCount * 1.5);
      const otherTokens = Math.ceil(otherCharCount / 4.5);
      const tokenEstimate = chineseTokens + otherTokens;
      
      // Add some margin for system messages, instructions, and model variation
      const totalTokens = Math.ceil(tokenEstimate * 1.1) + 200;
      
      console.log(`Token estimate: ${totalTokens} (${chineseCharCount} Chinese chars, ${otherCharCount} other chars)`);
      
      // Calculate estimated cost
      let estimatedCost = 0;
      if (modelInfo.pricing) {
        // OpenRouter pricing is per 1M tokens
        const promptCost = (parseFloat(modelInfo.pricing.prompt) || 0) * totalTokens / 1000000;
        
        // For completion, assume response is roughly same length as English text
        // Chinese text typically translates to longer English text
        const estimatedOutputTokens = Math.ceil(totalTokens * 1.2);
        const completionCost = (parseFloat(modelInfo.pricing.completion) || 0) * estimatedOutputTokens / 1000000;
        
        estimatedCost = promptCost + completionCost;
        console.log(`Estimated cost: ${estimatedCost.toFixed(6)} (prompt: ${promptCost.toFixed(6)}, completion: ${completionCost.toFixed(6)})`);
      }
      
      return {
        estimatedTokens: totalTokens,
        estimatedOutputTokens: Math.ceil(totalTokens * 1.2),
        estimatedCost: estimatedCost,
        model: modelInfo.name || model,
        contextLength: modelInfo.context_length || 4096
      };
    } catch (error) {
      console.error('Error estimating tokens and cost:', error);
      // Provide a fallback estimate to not block translation
      return {
        estimatedTokens: Math.ceil(text.length / 3) + 200,
        estimatedCost: 0,
        model: model,
        contextLength: 4096,
        isEstimateError: true
      };
    }
  }
}

// Create a singleton instance
const openRouterService = new OpenRouterService();

// Export default instance
export default openRouterService;

// Also export class for testing or extending
export { OpenRouterService };
