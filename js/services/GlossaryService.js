/**
 * GlossaryService.js - Module for handling glossary entries and operations
 * Refactored with correct import paths
 */

// Fix import paths to core modules
import StorageService from '../core/StorageService.js';
import UIService from '../core/UIService.js';
import TextService from '../core/TextService.js';

// Fix import paths to other services in the same directory
import OpenRouterService from './OpenRouterService.js';
import ProjectService from './ProjectService.js';

/**
 * Class for managing glossary entries and operations
 */
class GlossaryService {
  /**
   * Create a new GlossaryService instance
   */
  constructor() {
    // Cache for current project glossary entries
    this._glossaryCache = new Map();
  }
  
  /**
   * Initialize the glossary service
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      console.log('Initializing GlossaryService');
      
      // Set up event handlers
      this._setupEventHandlers();
      
      console.log('GlossaryService initialized successfully');
      return Promise.resolve();
    } catch (error) {
      console.error('Error initializing glossary service:', error);
      return Promise.reject(error);
    }
  }
  
  
  /**
   * Get all glossary entries for a project
   * @param {string} projectId - Project ID
   * @param {boolean} bypassCache - Whether to bypass the cache
   * @returns {Promise<Array>} Array of glossary entries
   */
  async getGlossaryEntries(projectId, bypassCache = false) {
    try {
      if (!projectId) {
        throw new Error('Project ID is required');
      }
      
      // Check cache first if not bypassing
      if (!bypassCache && this._glossaryCache.has(projectId)) {
        console.log(`Using cached glossary for project ${projectId}`);
        return this._glossaryCache.get(projectId);
      }
      
      const entries = await StorageService.getByIndex('glossary', 'projectId', projectId);
      
      // Sort entries by length (longest first) to optimize replacement operations
      const sortedEntries = (entries || []).sort((a, b) => 
        b.chineseTerm?.length - a.chineseTerm?.length
      );
      
      // Cache the entries
      this._glossaryCache.set(projectId, sortedEntries);
      
      return sortedEntries;
    } catch (error) {
      console.error('Error getting glossary entries:', error);
      throw error;
    }
  }
  
  /**
   * Add a new glossary entry
   * @param {Object} entry - Glossary entry to add
   * @returns {Promise<Object>} The added entry
   */
  async addGlossaryEntry(entry) {
    try {
      if (!entry.projectId) {
        throw new Error('Project ID is required');
      }
      
      if (!entry.chineseTerm || !entry.translation) {
        throw new Error('Chinese term and translation are required');
      }
      
      // Sanitize and normalize the entry
      const normalizedEntry = this._normalizeEntry(entry);
      
      // Check for duplicates
      const existingEntries = await this.getGlossaryEntries(normalizedEntry.projectId);
      const duplicate = existingEntries.find(e => 
        e.chineseTerm === normalizedEntry.chineseTerm
      );
      
      if (duplicate) {
        throw new Error(`A glossary entry for "${normalizedEntry.chineseTerm}" already exists`);
      }
      
      // Add ID if not provided
      if (!normalizedEntry.id) {
        normalizedEntry.id = StorageService.generateUUID();
      }
      
      await StorageService.saveItem('glossary', normalizedEntry);
      
      // Invalidate cache
      this._invalidateCache(normalizedEntry.projectId);
      
      return normalizedEntry;
    } catch (error) {
      console.error('Error adding glossary entry:', error);
      throw error;
    }
  }
  
  /**
   * Update a glossary entry
   * @param {Object} entry - Updated entry
   * @returns {Promise<Object>} The updated entry
   */
  async updateGlossaryEntry(entry) {
    try {
      if (!entry.id) {
        throw new Error('Entry ID is required');
      }
      
      // Normalize entry
      const normalizedEntry = this._normalizeEntry(entry);
      
      // Check if the entry exists
      const existingEntry = await StorageService.getItem('glossary', normalizedEntry.id);
      if (!existingEntry) {
        throw new Error(`Glossary entry with ID "${normalizedEntry.id}" not found`);
      }
      
      // If term changed, check for duplicates
      if (normalizedEntry.chineseTerm !== existingEntry.chineseTerm) {
        const existingEntries = await this.getGlossaryEntries(normalizedEntry.projectId);
        const duplicate = existingEntries.find(e => 
          e.chineseTerm === normalizedEntry.chineseTerm && e.id !== normalizedEntry.id
        );
        
        if (duplicate) {
          throw new Error(`A glossary entry for "${normalizedEntry.chineseTerm}" already exists`);
        }
      }
      
      // Save the updated entry
      await StorageService.saveItem('glossary', normalizedEntry);
      
      // Invalidate cache
      this._invalidateCache(normalizedEntry.projectId);
      
      return normalizedEntry;
    } catch (error) {
      console.error('Error updating glossary entry:', error);
      throw error;
    }
  }
  
  /**
   * Delete a glossary entry
   * @param {string} entryId - Entry ID to delete
   * @returns {Promise<void>}
   */
  async deleteGlossaryEntry(entryId) {
    try {
      // Get the entry first to know which project cache to invalidate
      const entry = await StorageService.getItem('glossary', entryId);
      if (!entry) {
        // Already deleted or doesn't exist
        return;
      }
      
      const projectId = entry.projectId;
      
      await StorageService.deleteItem('glossary', entryId);
      
      // Invalidate cache if we have a project ID
      if (projectId) {
        this._invalidateCache(projectId);
      }
    } catch (error) {
      console.error('Error deleting glossary entry:', error);
      throw error;
    }
  }
  
  /**
   * Delete multiple glossary entries efficiently
   * @param {Array} entryIds - Array of entry IDs to delete
   * @returns {Promise<{deleted: number, failed: number}>} Results with counts
   */
  async deleteMultipleGlossaryEntries(entryIds) {
    if (!Array.isArray(entryIds) || entryIds.length === 0) {
      return { deleted: 0, failed: 0 };
    }
    
    try {
      // Get all entries first to know which project caches to invalidate
      const entries = await Promise.all(
        entryIds.map(id => 
          StorageService.getItem('glossary', id)
            .catch(() => null) // Convert any fetch errors to null
        )
      );
      
      // Collect project IDs to invalidate caches later
      const projectIds = new Set();
      entries.forEach(entry => {
        if (entry && entry.projectId) {
          projectIds.add(entry.projectId);
        }
      });
      
      // Delete entries in batches
      const BATCH_SIZE = 20;
      const results = { deleted: 0, failed: 0 };
      
      // Process batches sequentially
      for (let startIndex = 0; startIndex < entryIds.length; startIndex += BATCH_SIZE) {
        const batchIds = entryIds.slice(startIndex, startIndex + BATCH_SIZE);
        const batchResults = await Promise.all(
          batchIds.map(id => 
            StorageService.deleteItem('glossary', id)
              .then(() => {
                results.deleted++;
                return true;
              })
              .catch(() => {
                results.failed++;
                return false;
              })
          )
        );
      }
      
      // Invalidate caches
      projectIds.forEach(projectId => this._invalidateCache(projectId));
      
      return results;
    } catch (error) {
      console.error('Error in deleteMultipleGlossaryEntries:', error);
      throw error;
    }
  }
  
  /**
   * Apply glossary replacements to text with optimized performance
   * @param {string} text - Text to process
   * @param {Array} entries - Glossary entries to apply
   * @returns {string} Processed text with replacements
   */
  applyGlossary(text, entries) {
    if (!text || !Array.isArray(entries) || entries.length === 0) {
      return text;
    }
    
    try {
      let processedText = text;
      
      // Sort entries by Chinese term length (longest first) to prevent partial replacements
      // Skip sort if entries are already sorted (e.g., from cache)
      let sortedEntries = entries;
      if (entries.length > 1 && (!entries[0] || !entries[1] || entries[0].chineseTerm?.length < entries[1].chineseTerm?.length)) {
        sortedEntries = entries.slice().sort((a, b) => 
          (b.chineseTerm?.length || 0) - (a.chineseTerm?.length || 0)
        );
      }
      
      // Create a Map for O(1) lookups
      const glossaryMap = new Map();
      sortedEntries.forEach(entry => {
        if (entry && entry.chineseTerm && entry.translation) {
          glossaryMap.set(entry.chineseTerm, entry.translation);
        }
      });
      
      // For very large texts, process in chunks to avoid regex timeouts
      if (text.length > 100000) {
        const chunkSize = 50000; // Process 50KB at a time
        const chunks = [];
        
        for (let i = 0; i < text.length; i += chunkSize) {
          let chunkText = text.substring(i, Math.min(i + chunkSize, text.length));
          const overlap = 200; // Overlap between chunks to handle terms that might span chunk boundaries
          
          if (i > 0) {
            // Get some text from the previous chunk to handle terms that span boundaries
            const prevChunkEnd = text.substring(Math.max(0, i - overlap), i);
            chunkText = prevChunkEnd + chunkText;
          }
          
          let processedChunk = chunkText;
          
          // Apply replacements to this chunk
          glossaryMap.forEach((translation, term) => {
            const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escapedTerm, 'g');
            processedChunk = processedChunk.replace(regex, translation);
          });
          
          if (i > 0) {
            // Remove the overlapped part from the processed chunk
            processedChunk = processedChunk.substring(overlap);
          }
          
          chunks.push(processedChunk);
        }
        
        return chunks.join('');
      } else {
        // For smaller texts, process all terms at once
        glossaryMap.forEach((translation, term) => {
          const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(escapedTerm, 'g');
          processedText = processedText.replace(regex, translation);
        });
        
        return processedText;
      }
    } catch (error) {
      console.error('Error applying glossary:', error);
      return text; // Return original text on error
    }
  }
  
  /**
   * Import glossary entries from JSON
   * @param {string} projectId - Project ID to import to
   * @param {string} json - JSON string with glossary entries
   * @param {string} strategy - Import strategy ('merge', 'replace', or 'update')
   * @returns {Promise<Object>} Import results
   */
  async importGlossary(projectId, json, strategy = 'merge') {
    try {
      if (!projectId) {
        throw new Error('Project ID is required');
      }
      
      // Parse and validate JSON
      let entries;
      try {
        entries = JSON.parse(json);
      } catch (error) {
        throw new Error('Invalid JSON format. Please check your file.');
      }
      
      if (!Array.isArray(entries)) {
        throw new Error('Glossary data must be an array of entries');
      }
      
      // Normalize and validate entries
      entries = entries.map(entry => this._normalizeImportedEntry(entry, projectId))
        .filter(entry => entry !== null);
      
      // Statistics
      const stats = {
        total: entries.length,
        added: 0,
        updated: 0,
        skipped: 0,
        invalid: 0
      };
      
      // If replacing, delete all existing entries
      if (strategy === 'replace') {
        const existingEntries = await this.getGlossaryEntries(projectId);
        const entryIds = existingEntries.map(entry => entry.id);
        await this.deleteMultipleGlossaryEntries(entryIds);
        
        // Then import all new entries in batches
        await this._importEntriesBatch(entries, projectId, stats);
      }
      // For update strategy
      else if (strategy === 'update') {
        const existingEntries = await this.getGlossaryEntries(projectId);
        const existingMap = new Map();
        existingEntries.forEach(entry => {
          existingMap.set(entry.chineseTerm, entry);
        });
        
        const toUpdate = [];
        const toAdd = [];
        
        // Separate entries into updates and adds
        entries.forEach(entry => {
          if (existingMap.has(entry.chineseTerm)) {
            // Update existing
            const existing = existingMap.get(entry.chineseTerm);
            entry.id = existing.id; // Preserve original ID
            toUpdate.push(entry);
          } else {
            // Add new
            toAdd.push(entry);
          }
        });
        
        // Process updates first
        await this._updateEntriesBatch(toUpdate, stats);
        // Then add new entries
        await this._importEntriesBatch(toAdd, projectId, stats);
      }
      // For merge strategy (default)
      else {
        const existingEntries = await this.getGlossaryEntries(projectId);
        const existingTerms = new Set();
        existingEntries.forEach(entry => {
          existingTerms.add(entry.chineseTerm);
        });
        
        // Filter out duplicates
        const newEntries = entries.filter(entry => {
          if (existingTerms.has(entry.chineseTerm)) {
            stats.skipped++;
            return false;
          }
          return true;
        });
        
        // Import new entries
        await this._importEntriesBatch(newEntries, projectId, stats);
      }
      
      // Invalidate cache
      this._invalidateCache(projectId);
      
      return {
        success: true,
        stats
      };
    } catch (error) {
      console.error('Error importing glossary:', error);
      throw error;
    }
  }
  
  /**
   * Export glossary entries to JSON
   * @param {string} projectId - Project ID to export
   * @param {boolean} includeIds - Whether to include IDs in export
   * @returns {Promise<string>} JSON string with glossary entries
   */
  async exportGlossary(projectId, includeIds = false) {
    try {
      if (!projectId) {
        throw new Error('Project ID is required');
      }
      
      const entries = await this.getGlossaryEntries(projectId);
      
      // If no entries, return empty array
      if (!entries || entries.length === 0) {
        return '[]';
      }
      
      // Create a clean version
      const exportData = entries.map(entry => {
        const exportEntry = {
          chineseTerm: entry.chineseTerm,
          translation: entry.translation,
          notes: entry.notes || '',
          category: entry.category || 'other'
        };
        
        // Include IDs if requested
        if (includeIds) {
          exportEntry.id = entry.id;
        }
        
        return exportEntry;
      });
      
      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('Error exporting glossary:', error);
      throw error;
    }
  }
  
  /**
   * Validates glossary entries to ensure they have the required fields
   * @param {Array} entries - Array of glossary entry objects to validate
   * @returns {Array} Valid glossary entries
   */
  validateGlossaryEntries(entries) {
    if (!Array.isArray(entries)) {
      console.error('Glossary entries is not an array:', entries);
      return [];
    }
    
    return entries.filter(entry => {
      // Check if entry is an object
      if (!entry || typeof entry !== 'object') {
        console.warn('Invalid glossary entry (not an object):', entry);
        return false;
      }
      
      // Check required fields
      if (!entry.chineseTerm || typeof entry.chineseTerm !== 'string' || !entry.chineseTerm.trim()) {
        console.warn('Invalid glossary entry (missing or invalid chineseTerm):', entry);
        return false;
      }
      
      if (!entry.translation || typeof entry.translation !== 'string' || !entry.translation.trim()) {
        console.warn('Invalid glossary entry (missing or invalid translation):', entry);
        return false;
      }
      
      // Trim strings
      entry.chineseTerm = entry.chineseTerm.trim();
      entry.translation = entry.translation.trim();
      
      // Ensure optional fields have proper defaults
      if (!entry.notes || typeof entry.notes !== 'string') {
        entry.notes = '';
      }
      
      // Validate category if present, otherwise set to default
      const validCategories = ['character', 'location', 'technique', 'item', 'concept', 'title', 'organization', 'other'];
      if (!entry.category || typeof entry.category !== 'string' || !validCategories.includes(entry.category.toLowerCase())) {
        entry.category = 'other';
      } else {
        entry.category = entry.category.toLowerCase();
      }
      
      return true;
    });
  }

  /**
   * Verifies and corrects the generated glossary JSON using the AI
   * @param {string} rawResponse - The raw response string from the initial glossary generation
   * @param {string} model - The OpenRouter model to use
   * @returns {Promise<Array>} - A promise that resolves to the corrected array of glossary entries
   */
  async verifyAndCorrectGlossary(rawResponse, model) {
    if (!rawResponse) {
      throw new Error('Raw response is required');
    }
    
    // First, try to directly parse the response
    try {
      const directParse = JSON.parse(rawResponse);
      if (Array.isArray(directParse)) {
        console.log("JSON parsed successfully on first attempt");
        return this.validateGlossaryEntries(directParse);
      }
    } catch (directError) {
      console.log("Direct JSON parsing failed, attempting basic cleanup...", directError);
    }
    
    // Basic cleanup attempt - extract just the JSON part if it's wrapped in code blocks or other text
    try {
      let cleanedJson = rawResponse;
      
      // Remove markdown code blocks if present
      const jsonBlockMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonBlockMatch && jsonBlockMatch[1]) {
        cleanedJson = jsonBlockMatch[1];
        console.log("Extracted JSON from code block");
      }
      
      // Look for array start/end if not in a code block
      if (!jsonBlockMatch) {
        const arrayMatch = rawResponse.match(/\[\s*{[\s\S]*}\s*\]/);
        if (arrayMatch) {
          cleanedJson = arrayMatch[0];
          console.log("Extracted JSON array using regex");
        }
      }
      
      // Try parsing the cleaned JSON
      const cleanedParse = JSON.parse(cleanedJson);
      if (Array.isArray(cleanedParse)) {
        console.log("JSON parsed successfully after basic cleanup");
        return this.validateGlossaryEntries(cleanedParse);
      }
    } catch (cleanupError) {
      console.log("Basic cleanup parsing failed, will attempt AI correction...", cleanupError);
    }
    
    // Use AI to correct the JSON if available
    try {
      const prompt = TextService.generateGlossaryVerificationPrompt(rawResponse);
      console.log("Attempting AI-based JSON correction...");
      
      const correctedJson = await OpenRouterService.generateCompletion(
        model,
        prompt,
        0.0,  // Low temperature for JSON
        4096, // Sufficient tokens
        false
      );
      
      // Try to parse the AI-corrected JSON
      try {
        const parsed = JSON.parse(correctedJson);
        if (Array.isArray(parsed)) {
          console.log("AI correction successful, JSON is valid");
          return this.validateGlossaryEntries(parsed);
        } else {
          throw new Error("AI did not return a valid JSON array after correction.");
        }
      } catch (aiParseError) {
        console.warn("AI-corrected JSON still invalid. Attempting basic repair...", aiParseError);

        // Basic Repair (as a last resort):
        let jsonStr = correctedJson;
        jsonStr = jsonStr.replace(/}(\s*){/g, '},{'); // Add missing commas
        jsonStr = jsonStr.replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":'); // Ensure property names are quoted
        jsonStr = jsonStr.replace(/: "([^"]*)"/g, (match, value) => {  // Escape quotes inside values
          const escapedValue = value.replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
          return `: "${escapedValue}"`;
        });
        if (!jsonStr.trim().startsWith('[')) jsonStr = '[' + jsonStr.trim();  // Ensure starts with [
        if (!jsonStr.trim().endsWith(']')) jsonStr = jsonStr.trim() + ']';    // Ensure ends with ]

        try {
          const parsed = JSON.parse(jsonStr);
          if (Array.isArray(parsed)) { // Check if array after the basic fix
            console.log("Basic JSON repair successful.");
            return this.validateGlossaryEntries(parsed);
          } else {
            throw new Error("Basic repair failed, not an array");
          }
        } catch (basicRepairError) {
          console.error("Basic JSON repair failed:", basicRepairError);
          throw new Error("Failed to parse JSON after all repair attempts.");
        }
      }
    } catch (error) {
      throw new Error("Failed to verify and correct glossary JSON: " + error.message);
    }
  }

  /**
   * Generate glossary entries from text using AI
   * @param {string} projectId - Project ID
   * @param {string} text - Text to analyze
   * @param {boolean} autoAdd - Whether to automatically add entries to glossary
   * @param {string} fandomContext - Optional fandom/universe context
   * @returns {Promise<Object>} Result object with entries and stats
   */
  async generateGlossaryEntries(projectId, text, autoAdd = true, fandomContext) {
    try {
      if (!projectId) {
        throw new Error('Project ID is required');
      }

      if (!text) {
        throw new Error('Text is required');
      }
      
      // Trim and limit text to a reasonable size to avoid token limits
      const trimmedText = text.trim();
      const maxTextLength = 10000;
      const analyzedText = trimmedText.length > maxTextLength 
        ? trimmedText.substring(0, maxTextLength) + '...' 
        : trimmedText;

      const project = await ProjectService.getProject(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      // Clean and validate fandom context
      const sanitizedContext = fandomContext ? String(fandomContext).trim() : '';
      
      // Generate prompt
      const prompt = TextService.generateGlossaryPrompt(analyzedText, sanitizedContext);
      
      const apiKey = project.settings?.openRouterApiKey;
      const model = project.settings?.openRouterModel || 'google/gemini-pro'; // Default

      if (!apiKey) {
        throw new Error('OpenRouter API key is required. Please configure it in Settings tab.');
      }
      
      UIService.showNotification(
        sanitizedContext ? 
          `Generating glossary entries for "${sanitizedContext}" context...` :
          'Generating glossary entries...',
        'info'
      );
      UIService.toggleLoading(true, 'Analyzing text and generating glossary entries...');
      
      // Generate entries using OpenRouterService
      const response = await OpenRouterService.generateCompletion(
        model,
        prompt,
        0.3, // Lower temperature
        4096 // Increase tokens
      );
      
      // Verify and correct the response
      const correctedEntries = await this.verifyAndCorrectGlossary(response, model);
      
      // Process and add entries
      const result = await this._processGeneratedEntries(
        projectId, 
        correctedEntries, 
        autoAdd, 
        sanitizedContext
      );
      
      UIService.toggleLoading(false);
      return result;
    } catch (error) {
      UIService.toggleLoading(false);
      console.error('Error generating glossary entries:', error);
      throw error;
    }
  }
  
  /**
   * Process and add generated glossary entries
   * @param {string} projectId - Project ID
   * @param {Array} entries - Generated entries
   * @param {boolean} autoAdd - Whether to automatically add entries
   * @param {string} fandomContext - Fandom context used for generation
   * @returns {Promise<Object>} Result with entries and stats
   * @private
   */
  async _processGeneratedEntries(projectId, entries, autoAdd, fandomContext) {
    try {
      const stats = {
        total: entries.length,
        added: 0,
        skipped: 0,
        invalid: 0
      };
      
      // Get existing entries to avoid duplicates
      const existingEntries = await this.getGlossaryEntries(projectId);
      const existingTerms = new Set();
      existingEntries.forEach(entry => {
        existingTerms.add(entry.chineseTerm);
      });
      
      const newEntries = [];
      
      // Process each entry
      entries.forEach(entry => {
        // Skip invalid entries
        if (!entry.chineseTerm || !entry.translation) {
          stats.invalid++;
          return;
        }
        
        // Clean up the entry
        const normalizedEntry = this._normalizeEntry({
          projectId: projectId,
          chineseTerm: entry.chineseTerm,
          translation: entry.translation,
          notes: entry.notes || '',
          category: entry.category || 'other'
        });
        
        // Skip duplicates
        if (existingTerms.has(normalizedEntry.chineseTerm)) {
          stats.skipped++;
          return;
        }
        
        // Add ID if not present
        if (!normalizedEntry.id) {
          normalizedEntry.id = StorageService.generateUUID();
        }
        
        newEntries.push(normalizedEntry);
      });
      
      if (autoAdd && newEntries.length > 0) {
        // Add entries in batches
        await this._importEntriesBatch(newEntries, projectId, stats);
        
        // Invalidate cache
        this._invalidateCache(projectId);
      }
      
      return {
        success: true,
        entries: newEntries,
        stats: stats,
        fandomContext: fandomContext
      };
    } catch (error) {
      console.error('Error processing generated entries:', error);
      throw error;
    }
  }
  
  /**
   * Import entries in batches for better performance
   * @param {Array} entries - Entries to import
   * @param {string} projectId - Project ID
   * @param {Object} stats - Stats object to update
   * @returns {Promise<void>}
   * @private
   */
  async _importEntriesBatch(entries, projectId, stats) {
    if (!entries || entries.length === 0) {
      return;
    }
    
    try {
      const BATCH_SIZE = 20;
      
      // Process batches sequentially
      for (let i = 0; i < entries.length; i += BATCH_SIZE) {
        const batch = entries.slice(i, i + BATCH_SIZE);
        
        // Process batch in parallel
        await Promise.all(batch.map(async entry => {
          try {
            // Ensure entry has project ID and UUID
            const completeEntry = {
              ...entry,
              projectId: projectId,
              id: entry.id || StorageService.generateUUID()
            };
            
            await StorageService.saveItem('glossary', completeEntry);
            stats.added++;
            return true;
          } catch (error) {
            console.error('Error adding glossary entry:', error);
            stats.invalid++;
            return false;
          }
        }));
      }
    } catch (error) {
      console.error('Error in _importEntriesBatch:', error);
      throw error;
    }
  }
  
  /**
   * Update entries in batches
   * @param {Array} entries - Entries to update
   * @param {Object} stats - Stats object to update
   * @returns {Promise<void>}
   * @private
   */
  async _updateEntriesBatch(entries, stats) {
    if (!entries || entries.length === 0) {
      return;
    }
    
    try {
      const BATCH_SIZE = 20;
      
      // Process batches sequentially
      for (let i = 0; i < entries.length; i += BATCH_SIZE) {
        const batch = entries.slice(i, i + BATCH_SIZE);
        
        // Process batch in parallel
        await Promise.all(batch.map(async entry => {
          try {
            await StorageService.saveItem('glossary', entry);
            stats.updated++;
            return true;
          } catch (error) {
            console.error('Error updating glossary entry:', error);
            stats.invalid++;
            return false;
          }
        }));
      }
    } catch (error) {
      console.error('Error in _updateEntriesBatch:', error);
      throw error;
    }
  }
  
  /**
   * Normalize and validate an entry
   * @param {Object} entry - Entry to normalize
   * @returns {Object} Normalized entry
   * @private
   */
  _normalizeEntry(entry) {
    const normalizedEntry = { ...entry };
    
    // Trim strings
    if (normalizedEntry.chineseTerm) {
      normalizedEntry.chineseTerm = normalizedEntry.chineseTerm.trim();
    }
    
    if (normalizedEntry.translation) {
      normalizedEntry.translation = normalizedEntry.translation.trim();
    }
    
    if (normalizedEntry.notes) {
      normalizedEntry.notes = normalizedEntry.notes.trim();
    } else {
      normalizedEntry.notes = '';
    }
    
    // Validate category
    const validCategories = ['character', 'location', 'technique', 'item', 'concept', 'title', 'organization', 'other'];
    if (!normalizedEntry.category || 
        typeof normalizedEntry.category !== 'string' || 
        !validCategories.includes(normalizedEntry.category.toLowerCase())) {
      normalizedEntry.category = 'other';
    } else {
      normalizedEntry.category = normalizedEntry.category.toLowerCase();
    }
    
    return normalizedEntry;
  }
  
  /**
   * Normalize and validate an imported entry
   * @param {Object} entry - Imported entry
   * @param {string} projectId - Project ID
   * @returns {Object|null} Normalized entry or null if invalid
   * @private
   */
  _normalizeImportedEntry(entry, projectId) {
    if (!entry || typeof entry !== 'object') {
      return null;
    }
    
    if (!entry.chineseTerm || !entry.translation) {
      return null;
    }
    
    return {
      id: entry.id || StorageService.generateUUID(),
      projectId: projectId,
      chineseTerm: String(entry.chineseTerm).trim(),
      translation: String(entry.translation).trim(),
      notes: entry.notes ? String(entry.notes).trim() : '',
      category: this._normalizeCategory(entry.category)
    };
  }
  
  /**
   * Normalize category to ensure it's valid
   * @param {string} category - Category to normalize
   * @returns {string} Normalized category
   * @private
   */
  _normalizeCategory(category) {
    const validCategories = ['character', 'location', 'technique', 'item', 'concept', 'title', 'organization', 'other'];
    
    if (!category || typeof category !== 'string') {
      return 'other';
    }
    
    const normalized = category.toLowerCase().trim();
    return validCategories.includes(normalized) ? normalized : 'other';
  }
  
  /**
   * Invalidate cache for a project
   * @param {string} projectId - Project ID
   * @private
   */
  _invalidateCache(projectId) {
    if (projectId) {
      this._glossaryCache.delete(projectId);
    }
  }
  
  /**
   * Clear all caches
   * @returns {void}
   */
  clearCache() {
    this._glossaryCache.clear();
  }
  
  /**
   * Render the glossary table in the UI
   * @param {string} projectId - Project ID
   * @returns {Promise<void>}
   */
  async renderGlossaryTable(projectId) {
    try {
      const tableBody = document.getElementById('glossary-terms-body');
      if (!tableBody || !projectId) {
        return;
      }
      
      // Get glossary entries
      const entries = await this.getGlossaryEntries(projectId);
      
      // Sort entries for display (by category and Chinese term)
      const sortedEntries = entries.sort((a, b) => {
        // Sort by category first
        if (a.category !== b.category) {
          return a.category.localeCompare(b.category);
        }
        // Then by Chinese term
        return a.chineseTerm.localeCompare(b.chineseTerm);
      });
      
      // Use document fragment for better performance
      const fragment = document.createDocumentFragment();
      
      // Reset UI states
      this._resetSelectionState();
      
      // Show empty state if no entries
      if (sortedEntries.length === 0) {
        const emptyRow = document.createElement('tr');
        const emptyCell = document.createElement('td');
        emptyCell.colSpan = 6;
        emptyCell.className = 'empty-state';
        emptyCell.textContent = 'No glossary terms yet. Add terms to improve translation consistency.';
        emptyRow.appendChild(emptyCell);
        fragment.appendChild(emptyRow);
      } else {
        // Chunk rendering for large glossaries
        this._renderEntriesChunked(sortedEntries, tableBody);
        return;
      }
      
      // Clear and update table
      tableBody.innerHTML = '';
      tableBody.appendChild(fragment);
    } catch (error) {
      console.error('Error rendering glossary table:', error);
      UIService.showNotification('Error loading glossary: ' + error.message, 'error');
      throw error;
    }
  }
  
  /**
   * Render entries in chunks for better performance with large glossaries
   * @param {Array} entries - Entries to render
   * @param {HTMLElement} tableBody - Table body element
   * @private
   */
  _renderEntriesChunked(entries, tableBody) {
    // Clear table first
    tableBody.innerHTML = '';
    
    const CHUNK_SIZE = 50; // Render 50 entries at a time
    const totalEntries = entries.length;
    
    // Function to render a chunk of entries
    const renderChunk = (startIndex) => {
      // If we've rendered all entries, stop
      if (startIndex >= totalEntries) {
        return;
      }
      
      // Create a document fragment for this chunk
      const fragment = document.createDocumentFragment();
      
      // Determine end index for this chunk
      const endIndex = Math.min(startIndex + CHUNK_SIZE, totalEntries);
      
      // Create rows for this chunk
      for (let i = startIndex; i < endIndex; i++) {
        const entry = entries[i];
        const row = this._createGlossaryRow(entry);
        fragment.appendChild(row);
      }
      
      // Add this chunk to the table
      tableBody.appendChild(fragment);
      
      // Schedule the next chunk with a small delay to allow UI updates
      if (endIndex < totalEntries) {
        setTimeout(() => renderChunk(endIndex), 10);
      }
    };
    
    // Start rendering chunks
    renderChunk(0);
  }
  
  /**
   * Create a table row for a glossary entry
   * @param {Object} entry - Glossary entry
   * @returns {HTMLElement} Table row element
   * @private
   */
  _createGlossaryRow(entry) {
    const row = document.createElement('tr');
    row.dataset.entryId = entry.id;
    
    // Checkbox Cell
    const checkboxCell = document.createElement('td');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'term-select-checkbox';
    checkbox.dataset.entryId = entry.id;
    checkbox.addEventListener('change', () => {
      this._updateSelectionState();
    });
    checkboxCell.appendChild(checkbox);
    row.appendChild(checkboxCell);
    
    // Chinese Term
    const termCell = document.createElement('td');
    termCell.className = 'glossary-term';
    termCell.title = entry.chineseTerm; // Show full term on hover
    termCell.textContent = entry.chineseTerm;
    row.appendChild(termCell);
    
    // Translation
    const translationCell = document.createElement('td');
    translationCell.className = 'glossary-translation';
    translationCell.title = entry.translation; // Show full translation on hover
    translationCell.textContent = entry.translation;
    row.appendChild(translationCell);
    
    // Category with badge
    const categoryCell = document.createElement('td');
    const categoryName = entry.category || 'other';
    const categoryBadge = document.createElement('span');
    categoryBadge.className = 'category-badge category-' + categoryName;
    categoryBadge.textContent = categoryName;
    categoryCell.appendChild(categoryBadge);
    row.appendChild(categoryCell);
    
    // Notes
    const notesCell = document.createElement('td');
    notesCell.className = 'glossary-notes';
    notesCell.title = entry.notes; // Show full notes on hover
    notesCell.textContent = entry.notes || '';
    row.appendChild(notesCell);
    
    // Actions
    const actionsCell = document.createElement('td');
    actionsCell.className = 'glossary-actions';
    
    // Edit button
    const editBtn = document.createElement('button');
    editBtn.innerHTML = '<i class="fas fa-edit"></i>';
    editBtn.title = 'Edit term';
    editBtn.className = 'small-btn';
    editBtn.addEventListener('click', () => this._showEditModal(entry));
    actionsCell.appendChild(editBtn);
    
    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
    deleteBtn.title = 'Delete term';
    deleteBtn.className = 'small-btn';
    deleteBtn.addEventListener('click', () => this._confirmDelete(entry));
    actionsCell.appendChild(deleteBtn);
    
    row.appendChild(actionsCell);
    
    return row;
  }
  
  /**
   * Show the edit modal for a glossary entry
   * @param {Object} entry - Glossary entry to edit
   * @private
   */
  _showEditModal(entry) {
    // Populate and show the edit modal
    const termChinese = document.getElementById('term-chinese');
    if (termChinese) termChinese.value = entry.chineseTerm;
    
    const termTranslation = document.getElementById('term-translation');
    if (termTranslation) termTranslation.value = entry.translation;
    
    const termCategory = document.getElementById('term-category');
    if (termCategory) termCategory.value = entry.category || 'other';
    
    const termNotes = document.getElementById('term-notes');
    if (termNotes) termNotes.value = entry.notes || '';
    
    // Store the entry ID as a data attribute
    const addTermModal = document.getElementById('add-term-modal');
    if (addTermModal) {
      addTermModal.dataset.entryId = entry.id;
      addTermModal.style.display = 'flex';
    }
  }
  
  /**
   * Confirm and delete a glossary entry
   * @param {Object} entry - Glossary entry to delete
   * @private
   */
  _confirmDelete(entry) {
    if (!confirm(`Are you sure you want to delete the term "${entry.chineseTerm}"?`)) {
      return;
    }
    
    this.deleteGlossaryEntry(entry.id)
      .then(() => {
        // Remove row from UI
        const row = document.querySelector(`tr[data-entry-id="${entry.id}"]`);
        if (row) row.remove();
        
        UIService.showNotification('Glossary term deleted', 'success');
        UIService.updateLastAction('Glossary term deleted');
        
        // Update selection state
        this._updateSelectionState();
      })
      .catch(error => {
        console.error('Error deleting glossary term:', error);
        UIService.showNotification(`Error deleting term: ${error.message}`, 'error');
      });
  }
  
  /**
   * Reset selection state UI elements
   * @private
   */
  _resetSelectionState() {
    // Update select-all checkbox state
    const selectAllCheckbox = document.getElementById('select-all-terms');
    if (selectAllCheckbox) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    }
    
    // Update delete button state and selected count
    const deleteSelectedBtn = document.getElementById('delete-selected-terms');
    const selectedCountSpan = document.getElementById('selected-count');
    if (deleteSelectedBtn) {
      deleteSelectedBtn.disabled = true;
    }
    if (selectedCountSpan) {
      selectedCountSpan.textContent = '0';
    }
  }
  
  /**
   * Update selection state based on checked boxes
   * @private
   */
  _updateSelectionState() {
    const checkboxes = document.querySelectorAll('.term-select-checkbox');
    const selectedCheckboxes = document.querySelectorAll('.term-select-checkbox:checked');
    const totalCount = checkboxes.length;
    const selectedCount = selectedCheckboxes.length;
    
    // Update the selected count display
    const selectedCountSpan = document.getElementById('selected-count');
    if (selectedCountSpan) {
      selectedCountSpan.textContent = selectedCount.toString();
    }
    
    // Update delete button state
    const deleteSelectedBtn = document.getElementById('delete-selected-terms');
    if (deleteSelectedBtn) {
      deleteSelectedBtn.disabled = selectedCount === 0;
    }
    
    // Update select all checkbox state
    const selectAllCheckbox = document.getElementById('select-all-terms');
    if (selectAllCheckbox) {
      if (selectedCount === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
      } else if (selectedCount === totalCount) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
      } else {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
      }
    }
  }
  
  /**
   * Set up all glossary-related event handlers
   * @private
   */
  _setupEventHandlers() {
    // Helper to add event listener safely
    const addListener = (elementId, eventType, handler) => {
      const element = document.getElementById(elementId);
      if (element) {
        element.addEventListener(eventType, handler.bind(this));
      }
    };
    
    // Add term button
    addListener('add-term-btn', 'click', this._handleAddTermClick);
    
    // Save term button
    addListener('save-term-btn', 'click', this._handleSaveTermClick);
    
    // Generate glossary button
    addListener('generate-glossary-btn', 'click', this._handleGenerateGlossaryClick);
    
    // Export glossary button
    addListener('export-glossary-btn', 'click', this._handleExportGlossaryClick);
    
    // Import glossary button
    addListener('import-glossary-btn', 'click', this._handleImportGlossaryClick);
    
    // Glossary search input
    addListener('glossary-search', 'input', this._handleGlossarySearchInput);
    
    // Category filter
    addListener('glossary-category-filter', 'change', this._handleCategoryFilterChange);
    
    // Tab change handler to refresh glossary
    const glossaryTab = document.querySelector('.tab-btn[data-tab="glossary"]');
    if (glossaryTab) {
      glossaryTab.addEventListener('click', () => {
        const currentProject = ProjectService.getCurrentProject();
        if (currentProject) {
          this.renderGlossaryTable(currentProject.id);
        }
      });
    }
    
    // Select all checkbox
    addListener('select-all-terms', 'change', this._handleSelectAllTermsChange);
    
    // Delete selected button
    addListener('delete-selected-terms', 'click', this._handleDeleteSelectedTermsClick);
    
    // Set up modal close handlers
    const addTermModal = document.getElementById('add-term-modal');
    if (addTermModal) {
      const closeButtons = addTermModal.querySelectorAll('.modal-close-btn, #close-term-modal-btn');
      closeButtons.forEach(button => {
        button.addEventListener('click', () => {
          addTermModal.style.display = 'none';
        });
      });
    }
    
    // Set up glossary toggle event handler
    const glossaryToggle = document.getElementById('apply-glossary-toggle');
    if (glossaryToggle) {
      glossaryToggle.addEventListener('change', (e) => {
        console.log("Glossary toggle changed to:", e.target.checked);
        localStorage.setItem('applyGlossary', e.target.checked);
      });
      
      // Initialize toggle state from localStorage
      const savedState = localStorage.getItem('applyGlossary');
      if (savedState !== null) {
        glossaryToggle.checked = savedState === 'true';
      } else {
        // If no saved state, set default and save it
        glossaryToggle.checked = true;
        localStorage.setItem('applyGlossary', 'true');
      }
    }
  }
  
  /**
   * Handle add term button click
   * @private
   */
  _handleAddTermClick() {
    // Clear form
    const formElements = [
      { id: 'term-chinese', value: '' },
      { id: 'term-translation', value: '' },
      { id: 'term-category', value: 'other' },
      { id: 'term-notes', value: '' }
    ];
    
    formElements.forEach(({id, value}) => {
      const element = document.getElementById(id);
      if (element) element.value = value;
    });
    
    // Clear entry ID
    const addTermModal = document.getElementById('add-term-modal');
    if (addTermModal) {
      addTermModal.dataset.entryId = '';
      addTermModal.style.display = 'flex';
    }
  }
  
  /**
   * Handle save term button click
   * @private
   */
  _handleSaveTermClick() {
    const currentProject = ProjectService.getCurrentProject();
    if (!currentProject) {
      UIService.showNotification('Please select a project first', 'warning');
      return;
    }
    
    // Get form elements
    const elements = {
      termChinese: document.getElementById('term-chinese'),
      termTranslation: document.getElementById('term-translation'),
      termCategory: document.getElementById('term-category'),
      termNotes: document.getElementById('term-notes'),
      addTermModal: document.getElementById('add-term-modal')
    };
    
    // Check if all elements exist
    if (!elements.termChinese || !elements.termTranslation || 
        !elements.termCategory || !elements.termNotes || !elements.addTermModal) {
      console.error('Missing form elements');
      return;
    }
    
    // Get values
    const chineseTerm = elements.termChinese.value.trim();
    const translation = elements.termTranslation.value.trim();
    const category = elements.termCategory.value;
    const notes = elements.termNotes.value.trim();
    
    // Validate
    if (!chineseTerm || !translation) {
      UIService.showNotification('Chinese term and translation are required', 'warning');
      return;
    }
    
    try {
      const entryId = elements.addTermModal.dataset.entryId;
      const entry = {
        projectId: currentProject.id,
        chineseTerm,
        translation,
        category,
        notes
      };
      
      if (entryId) {
        // Update existing entry
        entry.id = entryId;
        this.updateGlossaryEntry(entry)
          .then(() => {
            UIService.showNotification('Glossary term updated', 'success');
            UIService.updateLastAction('Glossary term updated');
            
            // Close modal
            elements.addTermModal.style.display = 'none';
            
            // Refresh table
            this.renderGlossaryTable(currentProject.id);
          })
          .catch(error => {
            console.error('Error updating glossary term:', error);
            UIService.showNotification(`Error updating term: ${error.message}`, 'error');
          });
      } else {
        // Add new entry
        this.addGlossaryEntry(entry)
          .then(() => {
            UIService.showNotification('Glossary term added', 'success');
            UIService.updateLastAction('Glossary term added');
            
            // Close modal
            elements.addTermModal.style.display = 'none';
            
            // Refresh table
            this.renderGlossaryTable(currentProject.id);
          })
          .catch(error => {
            console.error('Error adding glossary term:', error);
            UIService.showNotification(`Error adding term: ${error.message}`, 'error');
          });
      }
    } catch (error) {
      console.error('Error saving glossary term:', error);
      UIService.showNotification(`Error saving term: ${error.message}`, 'error');
    }
  }
  
  /**
   * Handle generate glossary button click
   * @private
   */
  _handleGenerateGlossaryClick() {
    const currentProject = ProjectService.getCurrentProject();
    if (!currentProject) {
      UIService.showNotification('Please select a project first', 'warning');
      return;
    }
    
    const inputText = document.getElementById('input-text');
    if (!inputText || !inputText.value.trim()) {
      UIService.showNotification('Please enter text in the input area first', 'warning');
      return;
    }
    
    try {
      const autoAddCheckbox = document.getElementById('auto-add-terms');
      const autoAdd = autoAddCheckbox ? autoAddCheckbox.checked : true;
      
      // Get fandom context if available
      const fandomContextInput = document.getElementById('fandom-context');
      const fandomContext = fandomContextInput ? fandomContextInput.value.trim() : '';
      
      this.generateGlossaryEntries(
        currentProject.id,
        inputText.value.trim(),
        autoAdd,
        fandomContext
      )
      .then(result => {
        if (result.success) {
          // Display generated terms
          const termsList = document.getElementById('generated-terms-list');
          if (termsList) {
            this._renderGeneratedTermsList(termsList, result);
          }
          
          let message = `Generated ${result.stats.total} terms.`;
          if (autoAdd) {
            message += ` Added ${result.stats.added}, skipped ${result.stats.skipped} duplicates.`;
          }
          if (result.fandomContext) {
            message += ` Context: "${result.fandomContext}".`;
          }
          UIService.showNotification(message, 'success');
          
          // Refresh table if terms were auto-added
          if (autoAdd && result.stats.added > 0) {
            this.renderGlossaryTable(currentProject.id);
          }
          
          // Switch to the Generator tab
          UIService.activateSecondaryTab('glossary-generator');
        }
      })
      .catch(error => {
        console.error('Error generating glossary:', error);
        UIService.showNotification(`Error generating glossary: ${error.message}`, 'error');
      });
    } catch (error) {
      console.error('Error generating glossary:', error);
      UIService.showNotification(`Error generating glossary: ${error.message}`, 'error');
    }
  }
  
  /**
   * Render generated terms list
   * @param {HTMLElement} container - Container element
   * @param {Object} result - Generation result
   * @private 
   */
  _renderGeneratedTermsList(container, result) {
    // Create document fragment for better performance
    const fragment = document.createDocumentFragment();
    
    // Clear container
    container.innerHTML = '';
    
    if (result.entries.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'empty-state';
      emptyState.textContent = 'No new terms found in the text.';
      fragment.appendChild(emptyState);
    } else {
      // Create term cards in chunks for better performance
      const renderTermsChunked = (startIndex = 0, chunkSize = 20) => {
        const endIndex = Math.min(startIndex + chunkSize, result.entries.length);
        
        for (let i = startIndex; i < endIndex; i++) {
          const entry = result.entries[i];
          const termCard = this._createTermCard(entry, result.autoAdd);
          fragment.appendChild(termCard);
        }
        
        if (endIndex < result.entries.length) {
          // Schedule next chunk
          setTimeout(() => {
            renderTermsChunked(endIndex, chunkSize);
          }, 10);
        }
      };
      
      renderTermsChunked();
    }
    
    container.appendChild(fragment);
  }
  
  /**
   * Create a term card for generated terms display
   * @param {Object} entry - Glossary entry
   * @param {boolean} autoAdd - Whether terms are automatically added
   * @returns {HTMLElement} Term card element
   * @private
   */
  _createTermCard(entry, autoAdd) {
    const termCard = document.createElement('div');
    termCard.className = 'generated-term-card';
    
    // Create category badge if category exists
    let categoryBadge = '';
    if (entry.category && entry.category !== 'other') {
      categoryBadge = `<span class="category-badge category-${entry.category}">${entry.category}</span>`;
    }
    
    termCard.innerHTML = `
      <div class="term-header">
        <div class="chinese-term">${entry.chineseTerm}</div>
        <div class="translation">${entry.translation}</div>
      </div>
      ${entry.notes ? `<div class="term-notes">${entry.notes}</div>` : ''}
      <div class="term-meta">
        ${categoryBadge}
      </div>
      <div class="term-actions">
        ${!autoAdd ? `<button class="add-term-btn small-btn">
          <i class="fas fa-plus"></i> Add
        </button>` : ''}
      </div>
    `;
    
    // Add click handler for add button
    if (!autoAdd) {
      const addBtn = termCard.querySelector('.add-term-btn');
      if (addBtn) {
        addBtn.addEventListener('click', () => {
          this.addGlossaryEntry(entry)
            .then(() => {
              termCard.classList.add('added');
              addBtn.disabled = true;
              addBtn.innerHTML = '<i class="fas fa-check"></i> Added';
              
              UIService.showNotification('Term added to glossary', 'success');
              
              // Refresh table if visible
              const glossaryTermsTab = document.getElementById('glossary-terms-tab');
              if (glossaryTermsTab && glossaryTermsTab.classList.contains('active')) {
                const currentProject = ProjectService.getCurrentProject();
                if (currentProject) {
                  this.renderGlossaryTable(currentProject.id);
                }
              }
            })
            .catch(error => {
              console.error('Error adding generated term:', error);
              UIService.showNotification(`Error adding term: ${error.message}`, 'error');
            });
        });
      }
    }
    
    return termCard;
  }
  
  /**
   * Handle export glossary button click
   * @private
   */
  _handleExportGlossaryClick() {
    const currentProject = ProjectService.getCurrentProject();
    if (!currentProject) {
      UIService.showNotification('Please select a project first', 'warning');
      return;
    }
    
    try {
      UIService.toggleLoading(true, 'Preparing glossary for export...');
      
      this.exportGlossary(currentProject.id)
        .then(json => {
          // Create and download file
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `glossary_${currentProject.name.replace(/\s+/g, '_')}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          
          UIService.toggleLoading(false);
          UIService.showNotification('Glossary exported successfully', 'success');
          UIService.updateLastAction('Glossary exported');
        })
        .catch(error => {
          console.error('Error exporting glossary:', error);
          UIService.toggleLoading(false);
          UIService.showNotification(`Error exporting glossary: ${error.message}`, 'error');
        });
    } catch (error) {
      console.error('Error exporting glossary:', error);
      UIService.toggleLoading(false);
      UIService.showNotification(`Error exporting glossary: ${error.message}`, 'error');
    }
  }
  
  /**
   * Handle import glossary button click
   * @private
   */
  _handleImportGlossaryClick() {
    const currentProject = ProjectService.getCurrentProject();
    if (!currentProject) {
      UIService.showNotification('Please select a project first', 'warning');
      return;
    }
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    
    input.addEventListener('change', e => {
      if (e.target.files.length === 0) return;
      
      const file = e.target.files[0];
      const reader = new FileReader();
      
      reader.onload = event => {
        try {
          const strategyRadios = document.querySelectorAll('input[name="import-strategy"]');
          let strategy = 'merge';
          
          for (let i = 0; i < strategyRadios.length; i++) {
            if (strategyRadios[i].checked) {
              strategy = strategyRadios[i].value;
              break;
            }
          }
          
          UIService.toggleLoading(true, 'Importing glossary...');
          
          const json = event.target.result;
          this.importGlossary(
            currentProject.id,
            json,
            strategy
          )
          .then(result => {
            UIService.toggleLoading(false);
            
            if (result.success) {
              let message = `Imported ${result.stats.total} terms.`;
              if (strategy === 'merge') {
                message += ` Added ${result.stats.added}, skipped ${result.stats.skipped} duplicates, ${result.stats.invalid} invalid.`;
              } else if (strategy === 'update') {
                message += ` Added ${result.stats.added}, updated ${result.stats.updated}, ${result.stats.invalid} invalid.`;
              } else {
                message += ` Added ${result.stats.added}, ${result.stats.invalid} invalid.`;
              }
              UIService.showNotification(message, 'success');
              
              // Refresh table
              this.renderGlossaryTable(currentProject.id);
              
              UIService.updateLastAction('Glossary imported');
            }
          })
          .catch(error => {
            UIService.toggleLoading(false);
            console.error('Error importing glossary:', error);
            UIService.showNotification(`Error importing glossary: ${error.message}`, 'error');
          });
        } catch (error) {
          UIService.toggleLoading(false);
          console.error('Error importing glossary:', error);
          UIService.showNotification(`Error importing glossary: ${error.message}`, 'error');
        }
      };
      
      reader.readAsText(file);
    });
    
    input.click();
  }
  
  /**
   * Handle glossary search input
   * @param {Event} e - Input event
   * @private
   */
  _handleGlossarySearchInput(e) {
    const query = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('#glossary-terms-body tr');
    
    rows.forEach(row => {
      // Skip empty state row
      if (row.querySelector('.empty-state')) return;
      
      const term = row.cells[1]?.textContent.toLowerCase() || '';
      const translation = row.cells[2]?.textContent.toLowerCase() || '';
      const notes = row.cells[4]?.textContent.toLowerCase() || '';
      
      // Search in term, translation, and notes
      if (term.includes(query) || translation.includes(query) || notes.includes(query)) {
        row.style.display = '';
      } else {
        row.style.display = 'none';
      }
    });
  }
  
  /**
   * Handle category filter change
   * @param {Event} e - Change event
   * @private
   */
  _handleCategoryFilterChange(e) {
    const category = e.target.value;
    const rows = document.querySelectorAll('#glossary-terms-body tr');
    
    rows.forEach(row => {
      // Skip empty state row
      if (row.querySelector('.empty-state')) return;
      
      if (category === 'all' || (row.cells[3] && row.cells[3].textContent.trim().toLowerCase() === category)) {
        row.style.display = '';
      } else {
        row.style.display = 'none';
      }
    });
  }
  
  /**
   * Handle select all terms change
   * @param {Event} e - Change event
   * @private
   */
  _handleSelectAllTermsChange(e) {
    const checkboxes = document.querySelectorAll('.term-select-checkbox');
    checkboxes.forEach(checkbox => {
      checkbox.checked = e.target.checked;
    });
    
    // Update selection state
    this._updateSelectionState();
  }
  
  /**
   * Handle delete selected terms click
   * @private
   */
  _handleDeleteSelectedTermsClick() {
    const selectedCheckboxes = document.querySelectorAll('.term-select-checkbox:checked');
    const selectedIds = Array.from(selectedCheckboxes).map(checkbox => checkbox.dataset.entryId);
    
    const count = selectedIds.length;
    if (count === 0) return;
    
    if (confirm(`Are you sure you want to delete ${count} selected term${count > 1 ? 's' : ''}?`)) {
      UIService.toggleLoading(true, `Deleting ${count} glossary terms...`);
      
      this.deleteMultipleGlossaryEntries(selectedIds)
        .then(results => {
          UIService.toggleLoading(false);
          
          let message = `Successfully deleted ${results.deleted} glossary terms`;
          if (results.failed > 0) {
            message += `, ${results.failed} failed`;
          }
          
          UIService.showNotification(message, 'success');
          UIService.updateLastAction(`Deleted ${results.deleted} glossary terms`);
          
          // Refresh the table
          const currentProject = ProjectService.getCurrentProject();
          if (currentProject) {
            this.renderGlossaryTable(currentProject.id);
          }
        })
        .catch(error => {
          UIService.toggleLoading(false);
          UIService.showNotification(`Error deleting terms: ${error.message}`, 'error');
          console.error('Error deleting multiple terms:', error);
        });
    }
  }
}

// Create a singleton instance
const glossaryService = new GlossaryService();

// Export default instance
export default glossaryService;

// Also export class for testing or extending
export { GlossaryService };