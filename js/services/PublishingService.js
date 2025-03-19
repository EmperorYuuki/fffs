/**
 * PublishingService.js - Module for managing publishing to external platforms
 * Integrates with ScribbleHub, WebNovel, FanFiction.net and other publishing platforms
 */

import StorageService from '../core/StorageService.js';
import UIService from '../core/UIService.js';

/**
 * Class for managing publishing to various platforms
 */
class PublishingService {
  constructor() {
    this.platformInfo = {
      webnovel: {
        name: 'Webnovel',
        serverPort: 3000,
        serverHost: 'localhost',
        cookieKey: 'webnovel_login_status',
        dataKey: 'webnovel_series_data',
        icon: 'fa-book-open'
      },
      scribblehub: {
        name: 'ScribbleHub',
        serverPort: 3001,
        serverHost: 'localhost',
        cookieKey: 'scribblehub_login_status',
        dataKey: 'scribblehub_series_data',
        icon: 'fa-pen-fancy'
      },
      fanfiction: {
        name: 'FanFiction.net',
        serverPort: 3002,
        serverHost: 'localhost',
        cookieKey: 'fanfiction_login_status',
        dataKey: 'fanfiction_series_data',
        icon: 'fa-fan'
      },
      ao3: {
        name: 'AO3',
        serverPort: 3003,
        serverHost: 'localhost',
        cookieKey: 'ao3_login_status',
        dataKey: 'ao3_series_data',
        icon: 'fa-archive'
      },
      questionablequesting: {
        name: 'Questionable Questing',
        serverPort: 3004,
        serverHost: 'localhost',
        cookieKey: 'qq_login_status',
        dataKey: 'qq_series_data',
        icon: 'fa-question-circle'
      }
    };
    
    // Track active requests
    this.activeRequests = new Map();
    
    // Track login status by platform
    this.loginStatus = this.loadLoginStatus();
    
    // Track platform series data
    this.seriesData = this.loadSeriesData();
    
    // Track scheduled publications
    this.scheduledPublications = this.loadScheduledPublications();
  }
  
  /**
   * Initialize the publishing service
   */
  async initialize() {
    console.log('Initializing PublishingService');
    
    // Set up polling for scheduled publications
    this.initializeSchedulePoller();
    
    console.log('PublishingService initialized');
    return true;
  }
  
  /**
   * Initialize schedule polling
   * @private
   */
  initializeSchedulePoller() {
    // Check every minute
    this.schedulePollerInterval = setInterval(() => this.checkScheduledPublications(), 60000);
    
    // Also check right away
    this.checkScheduledPublications();
  }
  
  /**
   * Load login status for all platforms
   * @private
   * @returns {Object} Login status by platform
   */
  loadLoginStatus() {
    const status = {};
    
    Object.keys(this.platformInfo).forEach(platform => {
      status[platform] = StorageService.getSetting(this.platformInfo[platform].cookieKey, false);
    });
    
    return status;
  }
  
  /**
   * Load series data for all platforms
   * @private
   * @returns {Object} Series data by platform
   */
  loadSeriesData() {
    const data = {};
    
    Object.keys(this.platformInfo).forEach(platform => {
      data[platform] = StorageService.getSetting(this.platformInfo[platform].dataKey, []);
    });
    
    return data;
  }
  
  /**
   * Load scheduled publications
   * @private
   * @returns {Array} Scheduled publications
   */
  loadScheduledPublications() {
    return StorageService.getSetting('scheduled_publications', []);
  }
  
  /**
   * Save login status for a platform
   * @param {string} platform - Platform ID
   * @param {boolean} status - Login status
   * @private
   */
  saveLoginStatus(platform, status) {
    this.loginStatus[platform] = status;
    StorageService.saveSetting(this.platformInfo[platform].cookieKey, status);
  }
  
  /**
   * Save series data for a platform
   * @param {string} platform - Platform ID
   * @param {Array} data - Series data
   * @private
   */
  saveSeriesData(platform, data) {
    this.seriesData[platform] = data;
    StorageService.saveSetting(this.platformInfo[platform].dataKey, data);
  }
  
  /**
   * Save scheduled publications
   * @private
   */
  saveScheduledPublications() {
    StorageService.saveSetting('scheduled_publications', this.scheduledPublications);
  }
  
  /**
   * Get login status for all platforms
   * @returns {Object} Login status by platform
   */
  getLoginStatus() {
    return {...this.loginStatus};
  }
  
  /**
   * Get series data for all platforms
   * @returns {Object} Series data by platform
   */
  getSeriesData() {
    return JSON.parse(JSON.stringify(this.seriesData));
  }
  
  /**
   * Check if logged in to a specific platform
   * @param {string} platform - Platform ID
   * @returns {boolean} Whether logged in to the platform
   */
  isLoggedIn(platform) {
    return this.loginStatus[platform] || false;
  }
  
  /**
   * Login to a platform
   * @param {string} platform - Platform ID
   * @returns {Promise<Object>} Result with success/error message
   */
  async login(platform) {
    if (!this.platformInfo[platform]) {
      return { success: false, message: `Unknown platform: ${platform}` };
    }
    
    // Generate a request ID
    const requestId = this.generateRequestId(platform);
    
    try {
      UIService.toggleLoading(true, `Logging in to ${this.platformInfo[platform].name}...`);
      
      // Store the active request
      this.activeRequests.set(requestId, { platform, type: 'login' });
      
      // Make the login request with CORS configuration
      const response = await fetch(
        `http://${this.platformInfo[platform].serverHost}:${this.platformInfo[platform].serverPort}/login?requestId=${requestId}`,
        { 
          method: 'GET',
          mode: 'cors',
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
            'Origin': window.location.origin
          }
        }
      ).catch(error => {
        // Handle network errors
        if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
          throw new Error(`Unable to connect to ${this.platformInfo[platform].name} server. Please ensure the server is running and accessible.`);
        }
        throw error;
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Login failed');
      }
      
      const data = await response.json();
      
      // Update login status
      this.saveLoginStatus(platform, true);
      
      // If response includes series data, save it
      if (data.series) {
        this.saveSeriesData(platform, data.series);
      }
      
      // Remove the active request
      this.activeRequests.delete(requestId);
      
      UIService.toggleLoading(false);
      return { success: true, message: data.message || `Successfully logged in to ${this.platformInfo[platform].name}` };
    } catch (error) {
      console.error(`Login error for ${platform}:`, error);
      
      // Remove the active request
      this.activeRequests.delete(requestId);
      
      UIService.toggleLoading(false);
      return { success: false, message: error.message || `Failed to login to ${this.platformInfo[platform].name}` };
    }
  }
  
  /**
   * Logout from a platform
   * @param {string} platform - Platform ID
   * @returns {Object} Result with success/error message
   */
  logout(platform) {
    if (!this.platformInfo[platform]) {
      return { success: false, message: `Unknown platform: ${platform}` };
    }
    
    try {
      // Update login status
      this.saveLoginStatus(platform, false);
      
      // We don't actually need to call the server, just clear the cookie status
      return { success: true, message: `Logged out from ${this.platformInfo[platform].name}` };
    } catch (error) {
      console.error(`Logout error for ${platform}:`, error);
      return { success: false, message: error.message || `Failed to logout from ${this.platformInfo[platform].name}` };
    }
  }
  
  /**
   * Publish a draft to a platform
   * @param {string} platform - Platform ID
   * @param {Object} draft - Draft to publish
   * @param {Object} options - Publishing options
   * @returns {Promise<Object>} Result with success/error message
   */
  async publish(platform, draft, options = {}) {
    if (!this.platformInfo[platform]) {
      return { success: false, message: `Unknown platform: ${platform}` };
    }
    
    if (!this.loginStatus[platform]) {
      return { success: false, message: `Please log in to ${this.platformInfo[platform].name} first` };
    }
    
    // Generate a request ID
    const requestId = this.generateRequestId(platform);
    
    try {
      UIService.toggleLoading(true, `Publishing to ${this.platformInfo[platform].name}...`);
      
      // Store the active request
      this.activeRequests.set(requestId, { platform, type: 'publish', draft: draft.id });
      
      // Get tags if available
      const tags = draft.tags || [];
      
      // Prepare the request body
      const requestBody = {
        title: draft.title,
        content: draft.content,
        folderName: options.folderName || draft.projectTitle || 'My Story',
        tags: tags,
        requestId
      };
      
      // Make the publish request
      const response = await fetch(
        `http://${this.platformInfo[platform].serverHost}:${this.platformInfo[platform].serverPort}/publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Publication failed');
      }
      
      const data = await response.json();
      
      // Update draft with publication info
      const publishHistory = draft.publishHistory || [];
      publishHistory.push({
        platform,
        timestamp: new Date().toISOString(),
        status: 'published',
        message: data.message
      });
      
      // Update draft status if requested
      let draftUpdated = false;
      if (options.updateStatus && draft.status !== 'published') {
        draft.status = 'published';
        draftUpdated = true;
      }
      
      draft.publishHistory = publishHistory;
      
      // Save the updated draft
      await StorageService.saveItem('drafts', draft);
      
      // Remove the active request
      this.activeRequests.delete(requestId);
      
      UIService.toggleLoading(false);
      return { success: true, message: data.message || `Successfully published to ${this.platformInfo[platform].name}`, draftUpdated };
    } catch (error) {
      console.error(`Publish error for ${platform}:`, error);
      
      // Remove the active request
      this.activeRequests.delete(requestId);
      
      UIService.toggleLoading(false);
      return { success: false, message: error.message || `Failed to publish to ${this.platformInfo[platform].name}` };
    }
  }
  
  /**
   * Schedule a publication
   * @param {string} platform - Platform ID or 'all' for all platforms
   * @param {Object} draft - Draft to publish
   * @param {Date} scheduledTime - Time to publish
   * @param {Object} options - Publishing options
   * @returns {Object} Result with success/error message
   */
  schedulePublication(platform, draft, scheduledTime, options = {}) {
    try {
      if (platform !== 'all' && !this.platformInfo[platform]) {
        return { success: false, message: `Unknown platform: ${platform}` };
      }
      
      // Validate the scheduled time
      if (!(scheduledTime instanceof Date) || isNaN(scheduledTime.getTime())) {
        return { success: false, message: 'Invalid scheduled time' };
      }
      
      // Create the scheduled publication
      const scheduledPublication = {
        id: this.generateUniqueId('schedule'),
        platform,
        draftId: draft.id,
        scheduledTime: scheduledTime.toISOString(),
        options,
        status: 'scheduled',
        attempts: 0
      };
      
      // Add to scheduled publications
      this.scheduledPublications.push(scheduledPublication);
      this.saveScheduledPublications();
      
      // Add to draft's publish history
      const publishHistory = draft.publishHistory || [];
      publishHistory.push({
        platform: platform === 'all' ? 'Multiple Platforms' : platform,
        timestamp: new Date().toISOString(),
        status: 'scheduled',
        scheduledTime: scheduledTime.toISOString(),
        message: `Scheduled for publication on ${scheduledTime.toLocaleString()}`
      });
      
      draft.publishHistory = publishHistory;
      
      // Save the updated draft
      StorageService.saveItem('drafts', draft);
      
      return {
        success: true,
        message: `Publication scheduled for ${scheduledTime.toLocaleString()}`
      };
    } catch (error) {
      console.error('Schedule publication error:', error);
      return { success: false, message: error.message || 'Failed to schedule publication' };
    }
  }
  
  /**
   * Check and execute scheduled publications
   * @private
   */
  async checkScheduledPublications() {
    console.log('Checking scheduled publications');
    
    if (!this.scheduledPublications || this.scheduledPublications.length === 0) {
      return;
    }
    
    const now = new Date();
    const updatedSchedule = [];
    
    for (const publication of this.scheduledPublications) {
      const scheduledTime = new Date(publication.scheduledTime);
      
      // Skip if not yet time to publish
      if (scheduledTime > now) {
        updatedSchedule.push(publication);
        continue;
      }
      
      // Time to publish!
      try {
        // Get the draft
        const draft = await StorageService.getItem('drafts', publication.draftId);
        if (!draft) {
          console.error(`Draft not found for scheduled publication: ${publication.draftId}`);
          
          // Mark as failed and keep in the list for now
          publication.status = 'failed';
          publication.error = 'Draft not found';
          updatedSchedule.push(publication);
          continue;
        }
        
        // Publish to all selected platforms
        if (publication.platform === 'all') {
          let someSuccess = false;
          const selectedPlatforms = publication.options.selectedPlatforms || 
            Object.keys(this.loginStatus).filter(p => this.loginStatus[p]);
          
          for (const platform of selectedPlatforms) {
            if (!this.loginStatus[platform]) continue;
            
            const result = await this.publish(platform, draft, publication.options);
            if (result.success) {
              someSuccess = true;
            }
          }
          
          // If at least one platform succeeded, consider it done
          if (someSuccess) {
            // Don't add to updatedSchedule - consider it complete
            continue;
          } else {
            // Failed, increment attempts
            publication.attempts += 1;
            publication.status = publication.attempts >= 3 ? 'failed' : 'scheduled';
            updatedSchedule.push(publication);
          }
        } else {
          // Publish to specific platform
          const result = await this.publish(publication.platform, draft, publication.options);
          if (result.success) {
            // Don't add to updatedSchedule - consider it complete
            continue;
          } else {
            // Failed, increment attempts
            publication.attempts += 1;
            publication.status = publication.attempts >= 3 ? 'failed' : 'scheduled';
            updatedSchedule.push(publication);
          }
        }
      } catch (error) {
        console.error('Error executing scheduled publication:', error);
        
        // Mark as failed and keep in the list for now
        publication.status = 'failed';
        publication.error = error.message;
        publication.attempts += 1;
        updatedSchedule.push(publication);
      }
    }
    
    // Update the scheduled publications
    this.scheduledPublications = updatedSchedule;
    this.saveScheduledPublications();
  }
  
  /**
   * Cancel a scheduled publication
   * @param {string} scheduleId - Schedule ID
   * @returns {Object} Result with success/error message
   */
  cancelScheduledPublication(scheduleId) {
    try {
      const index = this.scheduledPublications.findIndex(p => p.id === scheduleId);
      if (index === -1) {
        return { success: false, message: 'Scheduled publication not found' };
      }
      
      // Get the publication
      const publication = this.scheduledPublications[index];
      
      // Remove from the list
      this.scheduledPublications.splice(index, 1);
      this.saveScheduledPublications();
      
      // Update the draft's publish history
      StorageService.getItem('drafts', publication.draftId).then(draft => {
        if (!draft) return;
        
        const publishHistory = draft.publishHistory || [];
        publishHistory.push({
          platform: publication.platform === 'all' ? 'Multiple Platforms' : publication.platform,
          timestamp: new Date().toISOString(),
          status: 'cancelled',
          message: `Scheduled publication cancelled`
        });
        
        draft.publishHistory = publishHistory;
        StorageService.saveItem('drafts', draft);
      });
      
      return { success: true, message: 'Scheduled publication cancelled' };
    } catch (error) {
      console.error('Cancel scheduled publication error:', error);
      return { success: false, message: error.message || 'Failed to cancel scheduled publication' };
    }
  }
  
  /**
   * Generate a unique request ID
   * @param {string} platform - Platform ID
   * @returns {string} Unique request ID
   * @private
   */
  generateRequestId(platform) {
    return `${platform}-${Date.now()}-${Math.random().toString(36).substring(2, 12)}`;
  }
  
  /**
   * Generate a unique ID
   * @param {string} prefix - ID prefix
   * @returns {string} Unique ID
   * @private
   */
  generateUniqueId(prefix = 'id') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 12)}`;
  }
  
  /**
   * Cancel an active request
   * @param {string} requestId - Request ID
   * @returns {Promise<Object>} Result with success/error message
   */
  async cancelRequest(requestId) {
    if (!this.activeRequests.has(requestId)) {
      return { success: false, message: 'No active request found' };
    }
    
    try {
      const request = this.activeRequests.get(requestId);
      
      // Make the terminate request
      await fetch(
        `http://${this.platformInfo[request.platform].serverHost}:${this.platformInfo[request.platform].serverPort}/terminate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId })
        }
      );
      
      // Remove the active request
      this.activeRequests.delete(requestId);
      
      return { success: true, message: 'Request cancelled' };
    } catch (error) {
      console.error('Cancel request error:', error);
      
      // Remove the active request anyway
      this.activeRequests.delete(requestId);
      
      return { success: false, message: error.message || 'Failed to cancel request' };
    }
  }
  
  /**
   * Clean up the service before unloading
   */
  cleanup() {
    // Clear the schedule poller
    if (this.schedulePollerInterval) {
      clearInterval(this.schedulePollerInterval);
    }
    
    // Cancel all active requests
    for (const requestId of this.activeRequests.keys()) {
      this.cancelRequest(requestId).catch(console.error);
    }
  }
  
  /**
   * Get platform-specific publish options HTML
   * @param {string} platform - Platform ID
   * @returns {string} HTML for platform-specific publish options
   */
  getPublishOptionsHTML(platform) {
    const commonOptions = `
      <div class="form-group">
        <label for="folder-name">Folder/Series Name</label>
        <input type="text" id="folder-name" placeholder="Enter folder or series name">
      </div>
      <div class="form-group">
        <label class="checkbox-group">
          <input type="checkbox" id="update-status" checked>
          Update draft status to "published" after successful publication
        </label>
      </div>
    `;

    // Add platform-specific options
    switch (platform) {
      case 'webnovel':
        return `
          ${commonOptions}
          <div class="form-group">
            <label for="webnovel-category">Category</label>
            <select id="webnovel-category">
              <option value="fantasy">Fantasy</option>
              <option value="scifi">Science Fiction</option>
              <option value="romance">Romance</option>
              <option value="action">Action</option>
              <option value="other">Other</option>
            </select>
          </div>
        `;
      
      case 'scribblehub':
        return `
          ${commonOptions}
          <div class="form-group">
            <label for="sh-genre">Genre</label>
            <select id="sh-genre">
              <option value="fantasy">Fantasy</option>
              <option value="scifi">Science Fiction</option>
              <option value="romance">Romance</option>
              <option value="action">Action</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div class="form-group">
            <label class="checkbox-group">
              <input type="checkbox" id="sh-mature" value="1">
              Mark as Mature Content
            </label>
          </div>
        `;
      
      case 'fanfiction':
        return `
          ${commonOptions}
          <div class="form-group">
            <label for="ff-category">Category</label>
            <select id="ff-category">
              <option value="anime">Anime/Manga</option>
              <option value="books">Books</option>
              <option value="movies">Movies</option>
              <option value="games">Games</option>
              <option value="misc">Misc</option>
            </select>
          </div>
          <div class="form-group">
            <label for="ff-rating">Rating</label>
            <select id="ff-rating">
              <option value="K">K - All Ages</option>
              <option value="K+">K+ - Ages 9+</option>
              <option value="T">T - Ages 13+</option>
              <option value="M">M - Ages 16+</option>
            </select>
          </div>
        `;
      
      case 'ao3':
        return `
          ${commonOptions}
          <div class="form-group">
            <label for="ao3-rating">Rating</label>
            <select id="ao3-rating">
              <option value="G">General Audiences</option>
              <option value="T">Teen And Up</option>
              <option value="M">Mature</option>
              <option value="E">Explicit</option>
            </select>
          </div>
          <div class="form-group">
            <label for="ao3-warnings">Archive Warnings</label>
            <select id="ao3-warnings" multiple>
              <option value="violence">Graphic Violence</option>
              <option value="death">Major Character Death</option>
              <option value="noncon">Rape/Non-Con</option>
              <option value="underage">Underage</option>
              <option value="none">No Archive Warnings Apply</option>
            </select>
          </div>
        `;
      
      default:
        return commonOptions;
    }
  }

  /**
   * Get platform-specific publish options values
   * @param {string} platform - Platform ID
   * @returns {Object} Platform-specific options values
   */
  getPublishOptionsValues(platform) {
    const options = {
      folderName: document.getElementById('folder-name')?.value,
      updateStatus: document.getElementById('update-status')?.checked
    };

    // Add platform-specific options
    switch (platform) {
      case 'webnovel':
        options.category = document.getElementById('webnovel-category')?.value;
        break;
      
      case 'scribblehub':
        options.genre = document.getElementById('sh-genre')?.value;
        options.mature = document.getElementById('sh-mature')?.checked;
        break;
      
      case 'fanfiction':
        options.category = document.getElementById('ff-category')?.value;
        options.rating = document.getElementById('ff-rating')?.value;
        break;
      
      case 'ao3':
        options.rating = document.getElementById('ao3-rating')?.value;
        options.warnings = Array.from(document.getElementById('ao3-warnings')?.selectedOptions || [])
          .map(option => option.value);
        break;
    }

    return options;
  }
}

// Create and export a singleton instance
const publishingService = new PublishingService();
export default publishingService;