/**
 * ProjectService.js - Module for project management
 * Refactored from global window object to ES module syntax with fixed imports
 */

// Fix import paths to use the correct relative paths from /js/services to /js/core
import StorageService from '../core/StorageService.js';
import UIService from '../core/UIService.js';

/**
 * Class for managing projects including CRUD operations
 */
class ProjectService {
  /**
   * Create a new ProjectService instance
   */
  constructor() {
    // Current active project
    this.currentProject = null;
  }

  /**
   * Initialize the project service
   * @returns {Promise<void>} Promise that resolves when initialization is complete
   */
  async initialize() {
    try {
      console.log('Initializing ProjectService');

      // Try to load the last active project
      await this.loadLastProject();
      
      // Render the project list
      await this.renderProjectList();
      
      // Set up event listeners
      this.setupEventListeners();
      
      console.log('ProjectService initialized successfully');
    } catch (error) {
      console.error('Error initializing project service:', error);
      throw error;
    }
  }
  
  /**
   * Set up all event listeners for project functionality
   * @private
   */
  setupEventListeners() {
    try {
      // Set up the "Add Project" button
      const addProjectBtn = document.getElementById('add-project-btn');
      if (addProjectBtn) {
        addProjectBtn.addEventListener('click', this.handleAddProject.bind(this));
      }
      
      // Set up the Export Projects button
      const exportBtn = document.getElementById('export-projects-btn');
      if (exportBtn) {
        exportBtn.addEventListener('click', this.handleExportProjects.bind(this));
      }
      
      // Set up the Import Projects button
      const importBtn = document.getElementById('import-projects-btn');
      if (importBtn) {
        importBtn.addEventListener('click', this.handleImportProjects.bind(this));
      }
      
      // Set up project search
      const searchInput = document.getElementById('project-search-input');
      if (searchInput) {
        searchInput.addEventListener('input', this.handleProjectSearch.bind(this));
      }
      
      // Set up settings change handlers
      const translationMethod = document.getElementById('translation-method');
      if (translationMethod) {
        translationMethod.addEventListener('change', this.handleTranslationMethodChange.bind(this));
      }
      
      const chunkingStrategy = document.getElementById('chunking-strategy');
      if (chunkingStrategy) {
        chunkingStrategy.addEventListener('change', this.handleChunkingStrategyChange.bind(this));
      }
      
      const chunkSize = document.getElementById('chunk-size');
      if (chunkSize) {
        chunkSize.addEventListener('change', this.handleChunkSizeChange.bind(this));
      }
      
      // Auto-save input text
      const inputText = document.getElementById('input-text');
      if (inputText) {
        inputText.addEventListener('input', this.debounce(this.handleInputTextChange.bind(this), 1000));
      }
      
      // Update form in modal
      const customInstructionsBtn = document.getElementById('custom-instructions-btn');
      if (customInstructionsBtn) {
        customInstructionsBtn.addEventListener('click', this.handleCustomInstructionsClick.bind(this));
      }
      
      const saveInstructionsBtn = document.getElementById('save-instructions-btn');
      if (saveInstructionsBtn) {
        saveInstructionsBtn.addEventListener('click', this.handleSaveInstructions.bind(this));
      }
      
      const chatgptLinkBtn = document.getElementById('chatgpt-link-btn');
      if (chatgptLinkBtn) {
        chatgptLinkBtn.addEventListener('click', this.handleChatGPTLinkClick.bind(this));
      }
      
      const saveChatgptLinkBtn = document.getElementById('save-chatgpt-link-btn');
      if (saveChatgptLinkBtn) {
        saveChatgptLinkBtn.addEventListener('click', this.handleSaveChatGPTLink.bind(this));
      }
    } catch (error) {
      console.error('Error setting up event listeners:', error);
    }
  }

  /**
   * Handle adding a new project
   * @private
   */
  handleAddProject() {
    const name = prompt('Enter project name:');
    if (name) {
      UIService.toggleLoading(true, 'Creating project...');
      
      this.createProject(name)
        .then(project => {
          return this.setCurrentProject(project.id)
            .then(() => this.renderProjectList())
            .then(() => {
              // Update UI
              const projectDisplay = document.getElementById('current-project-display');
              if (projectDisplay) projectDisplay.textContent = project.name;
              
              const currentProject = document.getElementById('current-project');
              if (currentProject) currentProject.textContent = 'Project: ' + project.name;
              
              const lastSaved = document.getElementById('last-saved');
              if (lastSaved) lastSaved.textContent = 'Last saved: ' + new Date().toLocaleTimeString();
              
              UIService.updateLastAction('Project created');
              UIService.showNotification(`Project "${project.name}" created`, 'success');
              UIService.toggleLoading(false);
              
              return project;
            });
        })
        .catch(error => {
          console.error('Error creating project:', error);
          UIService.showNotification(`Error creating project: ${error.message}`, 'error');
          UIService.toggleLoading(false);
        });
    }
  }

  /**
   * Handle export projects button click
   * @private
   */
  handleExportProjects() {
    UIService.toggleLoading(true, 'Exporting projects...');
    
    this.exportProjects()
      .then(json => {
        // Create and download a file
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'quillsync_projects_' + new Date().toISOString().split('T')[0] + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        UIService.updateLastAction('Projects exported');
        UIService.showNotification('Projects exported successfully', 'success');
        UIService.toggleLoading(false);
      })
      .catch(error => {
        console.error('Error exporting projects:', error);
        UIService.showNotification(`Error exporting projects: ${error.message}`, 'error');
        UIService.toggleLoading(false);
      });
  }

  /**
   * Handle import projects button click
   * @private
   */
  handleImportProjects() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    
    input.addEventListener('change', e => {
      if (e.target.files.length === 0) return;
      
      const file = e.target.files[0];
      const reader = new FileReader();
      
      reader.onload = event => {
        UIService.toggleLoading(true, 'Importing projects...');
        
        const json = event.target.result;
        this.importProjects(json)
          .then(projects => {
            return this.renderProjectList()
              .then(() => {
                UIService.updateLastAction('Projects imported');
                UIService.showNotification(`${projects.length} projects imported successfully`, 'success');
                UIService.toggleLoading(false);
              });
          })
          .catch(error => {
            console.error('Error importing projects:', error);
            UIService.showNotification(`Error importing projects: ${error.message}`, 'error');
            UIService.toggleLoading(false);
          });
      };
      
      reader.readAsText(file);
    });
    
    input.click();
  }

  /**
   * Handle project search input
   * @param {Event} event - Input event
   * @private
   */
  async handleProjectSearch(event) {
    const query = event.target.value.toLowerCase();
    
    try {
      const projects = await this.getAllProjects();
      
      // Filter projects by name
      const filtered = query.trim() === '' 
        ? projects 
        : projects.filter(project => {
            return project.name.toLowerCase().includes(query);
          });
      
      // Update UI
      const projectList = document.getElementById('project-list');
      if (!projectList) return;
      
      const items = projectList.querySelectorAll('li');
      
      items.forEach(item => {
        const projectId = item.dataset.id;
        const project = filtered.find(p => p.id === projectId);
        
        if (project) {
          item.style.display = '';
        } else {
          item.style.display = 'none';
        }
      });
    } catch (error) {
      console.error('Error searching projects:', error);
    }
  }

  /**
   * Handle translation method change
   * @param {Event} event - Change event
   * @private
   */
  handleTranslationMethodChange(event) {
    if (!this.currentProject) return;
    
    this.updateProjectSettings(this.currentProject.id, {
      translationMethod: event.target.value
    })
      .then(() => {
        UIService.updateLastAction('Translation method updated');
      })
      .catch(error => {
        console.error('Error updating translation method:', error);
        UIService.showNotification(`Error updating settings: ${error.message}`, 'error');
      });
  }

  /**
   * Handle chunking strategy change
   * @param {Event} event - Change event
   * @private
   */
  handleChunkingStrategyChange(event) {
    if (!this.currentProject) return;
    
    this.updateProjectSettings(this.currentProject.id, {
      chunkingStrategy: event.target.value
    })
      .then(() => {
        UIService.updateLastAction('Chunking strategy updated');
      })
      .catch(error => {
        console.error('Error updating chunking strategy:', error);
        UIService.showNotification(`Error updating settings: ${error.message}`, 'error');
      });
  }

  /**
   * Handle chunk size change
   * @param {Event} event - Change event
   * @private
   */
  handleChunkSizeChange(event) {
    if (!this.currentProject) return;
    
    const size = parseInt(event.target.value);
    if (isNaN(size) || size < 100 || size > 5000) {
      event.target.value = this.currentProject.settings?.customChunkSize || 1000;
      return;
    }
    
    this.updateProjectSettings(this.currentProject.id, {
      customChunkSize: size
    })
      .then(() => {
        UIService.updateLastAction('Chunk size updated');
      })
      .catch(error => {
        console.error('Error updating chunk size:', error);
        UIService.showNotification(`Error updating settings: ${error.message}`, 'error');
      });
  }

  /**
   * Handle input text change for auto-save
   * @private
   */
  handleInputTextChange() {
    if (!this.currentProject) return;
    
    const inputText = document.getElementById('input-text');
    if (!inputText) return;
    
    this.updateProjectInput(this.currentProject.id, inputText.value)
      .catch(error => {
        console.error('Error auto-saving input:', error);
      });
  }

  /**
   * Handle custom instructions button click
   * @private
   */
  handleCustomInstructionsClick() {
    if (!this.currentProject) {
      UIService.showNotification('Please select a project first', 'warning');
      return;
    }
    
    const customInstructionsTextarea = document.getElementById('modal-custom-instructions');
    if (customInstructionsTextarea) {
      customInstructionsTextarea.value = this.currentProject.instructions || '';
    }
    
    const customInstructionsModal = document.getElementById('custom-instructions-modal');
    if (customInstructionsModal) {
      customInstructionsModal.style.display = 'flex';
    }
  }

  /**
   * Handle save instructions button click
   * @private
   */
  handleSaveInstructions() {
    if (!this.currentProject) return;
    
    const customInstructionsTextarea = document.getElementById('modal-custom-instructions');
    if (!customInstructionsTextarea) return;
    
    const instructions = customInstructionsTextarea.value;
    
    this.updateProjectInstructions(this.currentProject.id, instructions)
      .then(() => {
        const customInstructionsModal = document.getElementById('custom-instructions-modal');
        if (customInstructionsModal) {
          customInstructionsModal.style.display = 'none';
        }
        
        UIService.updateLastAction('Custom instructions updated');
        UIService.showNotification('Custom instructions saved', 'success');
      })
      .catch(error => {
        console.error('Error saving instructions:', error);
        UIService.showNotification(`Error saving instructions: ${error.message}`, 'error');
      });
  }

  /**
   * Handle ChatGPT link button click
   * @private
   */
  handleChatGPTLinkClick() {
    if (!this.currentProject) {
      UIService.showNotification('Please select a project first', 'warning');
      return;
    }
    
    const chatgptLinkInput = document.getElementById('modal-chatgpt-link');
    if (chatgptLinkInput) {
      chatgptLinkInput.value = this.currentProject.chatGPTUrl || '';
    }
    
    const chatgptLinkModal = document.getElementById('chatgpt-link-modal');
    if (chatgptLinkModal) {
      chatgptLinkModal.style.display = 'flex';
    }
  }

  /**
   * Handle save ChatGPT link button click
   * @private
   */
  handleSaveChatGPTLink() {
    if (!this.currentProject) return;
    
    const chatgptLinkInput = document.getElementById('modal-chatgpt-link');
    if (!chatgptLinkInput) return;
    
    const url = chatgptLinkInput.value;
    
    // Simple validation
    if (url && !url.startsWith('https://chatgpt.com/')) {
      UIService.showNotification('Please enter a valid ChatGPT URL (https://chatgpt.com/...)', 'warning');
      return;
    }
    
    this.updateProjectChatGPTUrl(this.currentProject.id, url)
      .then(() => {
        const chatgptLinkModal = document.getElementById('chatgpt-link-modal');
        if (chatgptLinkModal) {
          chatgptLinkModal.style.display = 'none';
        }
        
        UIService.updateLastAction('ChatGPT link updated');
        UIService.showNotification('ChatGPT conversation link saved', 'success');
      })
      .catch(error => {
        console.error('Error saving ChatGPT link:', error);
        UIService.showNotification(`Error saving link: ${error.message}`, 'error');
      });
  }

  /**
   * Create a new project
   * @param {string} name - Project name
   * @returns {Promise<Object>} The created project
   */
  async createProject(name) {
    try {
      if (!name || typeof name !== 'string' || name.trim() === '') {
        throw new Error('Project name cannot be empty');
      }
      
      // Check if a project with this name already exists
      const existingProjects = await this.getAllProjects();
      if (existingProjects.some(project => project.name === name)) {
        throw new Error(`A project with the name "${name}" already exists`);
      }
      
      const project = {
        id: StorageService.generateUUID(),
        name: name.trim(),
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        input: '',
        output: JSON.stringify([]),
        chatGPTUrl: '',
        instructions: '',
        settings: {
          translationMethod: 'chatgpt',
          openRouterApiKey: '',
          openRouterModel: '',
          autoVerify: false,
          customChunkSize: 1000,
          chunkingStrategy: 'auto'
        }
      };
      
      await StorageService.saveItem('projects', project);
      return project;
    } catch (error) {
      console.error('Error creating project:', error);
      throw error;
    }
  }

  /**
   * Get a project by ID
   * @param {string} id - Project ID
   * @returns {Promise<Object>} The requested project
   */
  async getProject(id) {
    try {
      const project = await StorageService.getItem('projects', id);
      if (!project) {
        throw new Error(`Project with ID "${id}" not found`);
      }
      return project;
    } catch (error) {
      console.error('Error getting project:', error);
      throw error;
    }
  }

  /**
   * Get all projects
   * @returns {Promise<Array>} Array of all projects
   */
  async getAllProjects() {
    try {
      const projects = await StorageService.getAllItems('projects');
      return projects || [];
    } catch (error) {
      console.error('Error getting all projects:', error);
      throw error;
    }
  }

  /**
   * Update a project
   * @param {Object} project - Project to update
   * @returns {Promise<Object>} The updated project
   */
  async updateProject(project) {
    try {
      if (!project || !project.id) {
        throw new Error('Invalid project');
      }
      
      // Update modified timestamp
      project.modified = new Date().toISOString();
      
      await StorageService.saveItem('projects', project);
      
      // If this is the current project, update the current project
      if (this.currentProject && this.currentProject.id === project.id) {
        this.currentProject = project;
      }
      
      return project;
    } catch (error) {
      console.error('Error updating project:', error);
      throw error;
    }
  }

  /**
   * Delete a project
   * @param {string} id - Project ID
   * @returns {Promise<void>}
   */
  async deleteProject(id) {
    try {
      // Delete project
      await StorageService.deleteItem('projects', id);
      
      // Reset current project if it's the one being deleted
      if (this.currentProject && this.currentProject.id === id) {
        this.currentProject = null;
        // Also clear from localStorage to avoid loading errors
        StorageService.saveSetting('currentProjectId', null);
      }
      
      // Delete related glossary entries
      const glossaryEntries = await StorageService.getByIndex('glossary', 'projectId', id);
      const deletePromises = glossaryEntries.map(entry => 
        StorageService.deleteItem('glossary', entry.id)
      );
      
      await Promise.all(deletePromises);
      
      // Delete related chapters
      const chapters = await StorageService.getByIndex('chapters', 'projectId', id);
      const chapterDeletePromises = chapters.map(chapter => 
        StorageService.deleteItem('chapters', chapter.id)
      );
      
      await Promise.all(chapterDeletePromises);
      
      // Delete related drafts
      try {
        const draftService = (await import('../services/DraftService.js')).default;
        await draftService.deleteDraftsForProject(id);
      } catch (error) {
        console.warn('Could not delete drafts for project:', error);
      }
    } catch (error) {
      console.error('Error deleting project:', error);
      throw error;
    }
  }

  /**
   * Set the current project
   * @param {string} id - Project ID
   * @returns {Promise<Object|null>} The selected project or null if not found
   */
  async setCurrentProject(id) {
    try {
      const project = await StorageService.getItem('projects', id);
      if (!project) {
        // Project not found, clear current project ID and resolve with null
        StorageService.saveSetting('currentProjectId', null);
        this.currentProject = null;
        return null;
      }
      
      this.currentProject = project;
      StorageService.saveSetting('currentProjectId', id);
      
      // Dispatch event for other services to listen to
      document.dispatchEvent(new CustomEvent('project-changed', { 
        detail: { projectId: id, project: project }
      }));
      
      return project;
    } catch (error) {
      console.error('Error setting current project:', error);
      throw error;
    }
  }

  /**
   * Get the current project
   * @returns {Object|null} The current project or null
   */
  getCurrentProject() {
    return this.currentProject;
  }

  /**
   * Load the last active project from settings
   * @returns {Promise<Object|null>} The loaded project or null
   */
  async loadLastProject() {
    try {
      const lastProjectId = StorageService.getSetting('currentProjectId');
      if (lastProjectId) {
        const project = await this.setCurrentProject(lastProjectId);
        return project;
      }
      return null;
    } catch (error) {
      console.warn('Could not load last project:', error);
      return null;
    }
  }

  /**
   * Update project input text
   * @param {string} id - Project ID
   * @param {string} text - Input text
   * @returns {Promise<Object>} The updated project
   */
  async updateProjectInput(id, text) {
    try {
      const project = await this.getProject(id);
      project.input = text;
      const updatedProject = await this.updateProject(project);
      return updatedProject;
    } catch (error) {
      console.error('Error updating project input:', error);
      throw error;
    }
  }

  /**
   * Update project output text
   * @param {string} id - Project ID
   * @param {Array} delta - Quill delta operations
   * @returns {Promise<Object>} The updated project
   */
  async updateProjectOutput(id, delta) {
    try {
      const project = await this.getProject(id);
      project.output = JSON.stringify(delta);
      const updatedProject = await this.updateProject(project);
      return updatedProject;
    } catch (error) {
      console.error('Error updating project output:', error);
      throw error;
    }
  }

  /**
   * Update project settings
   * @param {string} id - Project ID
   * @param {Object} settings - New settings
   * @returns {Promise<Object>} The updated project
   */
  async updateProjectSettings(id, settings) {
    try {
      const project = await this.getProject(id);
      // Use Object.assign to merge settings
      project.settings = Object.assign({}, project.settings || {}, settings);
      const updatedProject = await this.updateProject(project);
      return updatedProject;
    } catch (error) {
      console.error('Error updating project settings:', error);
      throw error;
    }
  }

  /**
   * Update project custom instructions
   * @param {string} id - Project ID
   * @param {string} instructions - Custom instructions
   * @returns {Promise<Object>} The updated project
   */
  async updateProjectInstructions(id, instructions) {
    try {
      const project = await this.getProject(id);
      project.instructions = instructions;
      const updatedProject = await this.updateProject(project);
      return updatedProject;
    } catch (error) {
      console.error('Error updating project instructions:', error);
      throw error;
    }
  }

  /**
   * Update project ChatGPT URL
   * @param {string} id - Project ID
   * @param {string} url - ChatGPT conversation URL
   * @returns {Promise<Object>} The updated project
   */
  async updateProjectChatGPTUrl(id, url) {
    try {
      const project = await this.getProject(id);
      project.chatGPTUrl = url;
      const updatedProject = await this.updateProject(project);
      return updatedProject;
    } catch (error) {
      console.error('Error updating project ChatGPT URL:', error);
      throw error;
    }
  }

  /**
   * Export projects to JSON
   * @returns {Promise<string>} JSON string of all projects
   */
  async exportProjects() {
    try {
      const projects = await this.getAllProjects();
      
      // Enhance projects with their related data
      const enhancedProjectsPromises = projects.map(async project => {
        // Get glossary entries for this project
        const glossaryEntries = await StorageService.getByIndex('glossary', 'projectId', project.id);
        
        // Add glossary entries to project
        project.glossary = glossaryEntries;
        
        // Get chapters for this project
        const chapters = await StorageService.getByIndex('chapters', 'projectId', project.id);
        
        // Add chapters to project
        project.chapters = chapters;
        return project;
      });
      
      const enhancedProjects = await Promise.all(enhancedProjectsPromises);
      return JSON.stringify(enhancedProjects, null, 2);
    } catch (error) {
      console.error('Error exporting projects:', error);
      throw error;
    }
  }

  /**
   * Import projects from JSON
   * @param {string} json - JSON string of projects
   * @returns {Promise<Array>} Array of imported projects
   */
  async importProjects(json) {
    try {
      const projects = JSON.parse(json);
      if (!Array.isArray(projects)) {
        throw new Error('Invalid projects data');
      }
      
      const importedProjects = [];
      
      for (const project of projects) {
        // Extract glossary and chapters
        const glossary = project.glossary || [];
        const chapters = project.chapters || [];
        
        // Remove them from the project object
        delete project.glossary;
        delete project.chapters;
        
        // Skip if project doesn't have required fields
        if (!project.id || !project.name) {
          console.warn('Skipping invalid project:', project);
          continue;
        }
        
        // Add the project
        await StorageService.saveItem('projects', project);
        importedProjects.push(project);
        
        // Add glossary entries
        for (const entry of glossary) {
          if (!entry.id) {
            entry.id = StorageService.generateUUID();
          }
          entry.projectId = project.id;
          await StorageService.saveItem('glossary', entry);
        }
        
        // Add chapters
        for (const chapter of chapters) {
          if (!chapter.id) {
            chapter.id = StorageService.generateUUID();
          }
          chapter.projectId = project.id;
          await StorageService.saveItem('chapters', chapter);
        }
      }
      
      return importedProjects;
    } catch (error) {
      console.error('Error importing projects:', error);
      throw error;
    }
  }

  /**
   * Render the project list in the UI
   * @returns {Promise<void>}
   */
  async renderProjectList() {
    try {
      const projectList = document.getElementById('project-list');
      if (!projectList) {
        console.warn('Project list element not found');
        return;
      }
      
      // Get all projects
      const projects = await this.getAllProjects();
      
      // Sort by modified date (most recent first)
      projects.sort((a, b) => new Date(b.modified) - new Date(a.modified));
      
      // Clear the list
      projectList.innerHTML = '';
      
      // Add each project
      projects.forEach(project => {
        const li = document.createElement('li');
        li.textContent = project.name;
        li.dataset.id = project.id;
        
        if (this.currentProject && this.currentProject.id === project.id) {
          li.classList.add('active');
        }
        
        li.addEventListener('click', () => {
          this.handleProjectClick(project, li);
        });
        
        // Add delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
        deleteBtn.title = 'Delete project ' + project.name;
        deleteBtn.className = 'delete-project-btn';
        
        deleteBtn.addEventListener('click', e => {
          this.handleProjectDeleteClick(e, project, li);
        });
        
        li.appendChild(deleteBtn);
        projectList.appendChild(li);
      });
      
      // Show empty state if no projects
      if (projects.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.innerHTML = '<p>No projects yet.</p><p>Create a new project to get started.</p>';
        projectList.appendChild(emptyState);
      }
    } catch (error) {
      console.error('Error rendering project list:', error);
      UIService.showNotification('Error loading projects', 'error');
      throw error;
    }
  }

  /**
   * Handle project item click
   * @param {Object} project - The project that was clicked
   * @param {HTMLElement} listItem - The list item element
   * @private
   */
  handleProjectClick(project, listItem) {
    this.setCurrentProject(project.id)
      .then(() => {
        // Update UI to reflect the selected project
        document.querySelectorAll('#project-list li').forEach(item => {
          item.classList.remove('active');
        });
        listItem.classList.add('active');
        
        // Update current project display
        const projectDisplay = document.getElementById('current-project-display');
        if (projectDisplay) projectDisplay.textContent = project.name;
        
        const currentProject = document.getElementById('current-project');
        if (currentProject) currentProject.textContent = 'Project: ' + project.name;
        
        // Update last saved display
        const lastSaved = document.getElementById('last-saved');
        if (lastSaved) {
          const lastSavedTime = new Date(project.modified).toLocaleTimeString();
          lastSaved.textContent = 'Last saved: ' + lastSavedTime;
        }
        
        // Load project content
        const inputText = document.getElementById('input-text');
        if (inputText) inputText.value = project.input || '';
        
        // Load Quill content if available
        const quill = UIService.getQuill();
        if (quill && project.output) {
          try {
            const delta = JSON.parse(project.output);
            quill.setContents(delta);
          } catch (e) {
            console.warn('Could not parse project output:', e);
            quill.setText('');
          }
        }
        
        // Update word counts
        UIService.updateWordCounts();
        
        // Update UI to reflect project settings
        this.updateSettingsUI(project);
        
        // Update last action
        UIService.updateLastAction('Project loaded');
        UIService.showNotification(`Project "${project.name}" loaded`, 'success');
      })
      .catch(error => {
        console.error('Error selecting project:', error);
        UIService.showNotification(`Error loading project: ${error.message}`, 'error');
      });
  }

  /**
   * Handle project delete button click
   * @param {Event} event - Click event
   * @param {Object} project - The project to delete
   * @param {HTMLElement} listItem - The list item element
   * @private
   */
  handleProjectDeleteClick(event, project, listItem) {
    event.stopPropagation();
    
    if (confirm(`Are you sure you want to delete project "${project.name}"? This action cannot be undone.`)) {
      this.deleteProject(project.id)
        .then(() => {
          // Remove from UI
          listItem.remove();
          
          // If this was the current project, clear the UI
          if (this.currentProject && this.currentProject.id === project.id) {
            const projectDisplay = document.getElementById('current-project-display');
            if (projectDisplay) projectDisplay.textContent = 'No Project Selected';
            
            const currentProject = document.getElementById('current-project');
            if (currentProject) currentProject.textContent = 'No Project';
            
            const lastSaved = document.getElementById('last-saved');
            if (lastSaved) lastSaved.textContent = 'Last saved: Never';
            
            // Clear input and output
            const inputText = document.getElementById('input-text');
            if (inputText) inputText.value = '';
            
            const quill = UIService.getQuill();
            if (quill) {
              quill.setText('');
            }
            
            // Update word counts
            UIService.updateWordCounts();
          }
          
          UIService.updateLastAction('Project deleted');
          UIService.showNotification(`Project "${project.name}" deleted`, 'success');
        })
        .catch(error => {
          console.error('Error deleting project:', error);
          UIService.showNotification(`Error deleting project: ${error.message}`, 'error');
        });
    }
  }

  /**
   * Update UI elements to reflect project settings
   * @param {Object} project - The project
   */
  updateSettingsUI(project) {
    try {
      // Translation method
      const methodSelect = document.getElementById('translation-method');
      if (methodSelect) {
        methodSelect.value = project.settings?.translationMethod || 'chatgpt';
      }
      
      // Chunking strategy
      const chunkingSelect = document.getElementById('chunking-strategy');
      if (chunkingSelect) {
        chunkingSelect.value = project.settings?.chunkingStrategy || 'auto';
      }
      
      // Chunk size
      const chunkSizeInput = document.getElementById('chunk-size');
      if (chunkSizeInput) {
        chunkSizeInput.value = project.settings?.customChunkSize || 1000;
      }
      
      // Update settings tab values if present
      const defaultMethodSelect = document.getElementById('default-translation-method');
      if (defaultMethodSelect) {
        defaultMethodSelect.value = project.settings?.translationMethod || 'chatgpt';
      }
      
      const defaultChunkingSelect = document.getElementById('default-chunking-strategy');
      if (defaultChunkingSelect) {
        defaultChunkingSelect.value = project.settings?.chunkingStrategy || 'auto';
      }
      
      const defaultChunkSizeInput = document.getElementById('default-chunk-size');
      if (defaultChunkSizeInput) {
        defaultChunkSizeInput.value = project.settings?.customChunkSize || 1000;
      }
      
      const autoVerifyCheckbox = document.getElementById('auto-verify');
      if (autoVerifyCheckbox) {
        autoVerifyCheckbox.checked = project.settings?.autoVerify || false;
      }
      
      // OpenRouter API key
      const apiKeyInput = document.getElementById('openrouter-api-key');
      if (apiKeyInput) {
        apiKeyInput.value = project.settings?.openRouterApiKey || '';
      }
      
      // OpenRouter model
      const modelSelect = document.getElementById('openrouter-model');
      if (modelSelect && project.settings?.openRouterModel) {
        modelSelect.value = project.settings.openRouterModel;
      }
      
      // Custom instructions
      const instructionsInput = document.getElementById('modal-custom-instructions');
      if (instructionsInput) {
        instructionsInput.value = project.instructions || '';
      }
      
      // ChatGPT URL
      const chatGPTLinkInput = document.getElementById('modal-chatgpt-link');
      if (chatGPTLinkInput) {
        chatGPTLinkInput.value = project.chatGPTUrl || '';
      }
    } catch (error) {
      console.error('Error updating settings UI:', error);
    }
  }

  /**
   * Debounce function for rate limiting
   * @param {Function} func - Function to debounce
   * @param {number} wait - Wait time in milliseconds
   * @returns {Function} Debounced function
   */
  debounce(func, wait) {
    let timeout;
    return function() {
      const context = this;
      const args = arguments;
      const later = function() {
        timeout = null;
        func.apply(context, args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
}

// Create a singleton instance
const projectService = new ProjectService();

// Export the singleton as default export
export default projectService;

// Also export class for testing or extending
export { ProjectService };