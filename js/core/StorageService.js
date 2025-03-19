/**
 * StorageService.js - Unified module for database operations
 * Combines functionality from DBService and StorageUtils
 */

// Constants
const DB_NAME = 'QuillSyncDB';
const DB_VERSION = 2; // Increased version for drafts store

// Private variables
let dbInstance = null;

/**
 * Initialize the database
 * @returns {Promise<IDBDatabase>} IndexedDB database instance
 * @private
 */
const initDatabase = async () => {
  if (dbInstance) {
    return dbInstance;
  }
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = (event) => {
      console.error('IndexedDB error:', event.target.error);
      reject(event.target.error);
    };
    
    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      console.log('Database opened successfully');
      resolve(dbInstance);
    };
    
    request.onupgradeneeded = (event) => {
      dbInstance = event.target.result;
      console.log('Database upgrade needed');
      
      // Create object stores if they don't exist
      createObjectStores(dbInstance, event.target.transaction);
    };
  });
};

/**
 * Create the necessary object stores in the database
 * @param {IDBDatabase} db - IndexedDB database instance
 * @param {IDBTransaction} transaction - Current upgrade transaction
 * @private
 */
const createObjectStores = (db, transaction) => {
  // Projects store
  if (!db.objectStoreNames.contains('projects')) {
    const projectStore = db.createObjectStore('projects', { keyPath: 'id' });
    projectStore.createIndex('name', 'name', { unique: true });
    projectStore.createIndex('modified', 'modified', { unique: false });
    console.log('Created projects store');
  }
  
  // Glossary store
  if (!db.objectStoreNames.contains('glossary')) {
    const glossaryStore = db.createObjectStore('glossary', { keyPath: 'id' });
    glossaryStore.createIndex('projectId', 'projectId', { unique: false });
    glossaryStore.createIndex('chineseTerm', 'chineseTerm', { unique: false });
    console.log('Created glossary store');
  }
  
  // Chapters store
  if (!db.objectStoreNames.contains('chapters')) {
    const chapterStore = db.createObjectStore('chapters', { keyPath: 'id' });
    chapterStore.createIndex('projectId', 'projectId', { unique: false });
    chapterStore.createIndex('url', 'url', { unique: false });
    console.log('Created chapters store');
  }
  
  // Website configs store
  if (!db.objectStoreNames.contains('websiteConfigs')) {
    const configStore = db.createObjectStore('websiteConfigs', { keyPath: 'id' });
    configStore.createIndex('name', 'name', { unique: true });
    console.log('Created websiteConfigs store');
    
    // Add default website configurations using transaction
    const store = transaction.objectStore('websiteConfigs');
    
    // TRXS config
    store.add({
      id: crypto.randomUUID(),
      name: 'trxs.cc',
      baseUrl: 'https://www.trxs.cc',
      urlPattern: '^https://www\\.trxs\\.cc/tongren/\\d+/\\d+\\.html$',
      selectors: {
        chapterContent: '.read_chapterDetail',
        chapterTitle: '.read_chapterName h1',
        prevChapter: '.pageNav a[href*="tongren"][href*="html"]:nth-child(2)',
        nextChapter: '.pageNav a:contains("下一章")'
      },
      isActive: true
    });
    
    // 69yuedu config
    store.add({
      id: crypto.randomUUID(),
      name: '69yuedu.net',
      baseUrl: 'https://www.69yuedu.net',
      urlPattern: '^https://www\\.69yuedu\\.net/\\w+/\\d+/\\d+\\.html$',
      selectors: {
        chapterContent: '.content',
        chapterTitle: 'h1.hide720',
        prevChapter: '.page1 a:contains("上一章")',
        nextChapter: '.page1 a:contains("下一章")'
      },
      isActive: true
    });
  }
  
  // Settings store
  if (!db.objectStoreNames.contains('settings')) {
    db.createObjectStore('settings', { keyPath: 'key' });
    console.log('Created settings store');
  }
  
  // Drafts store
  if (!db.objectStoreNames.contains('drafts')) {
    const draftsStore = db.createObjectStore('drafts', { keyPath: 'id' });
    draftsStore.createIndex('projectId', 'projectId', { unique: false });
    draftsStore.createIndex('title', 'title', { unique: false });
    draftsStore.createIndex('modified', 'modified', { unique: false });
    draftsStore.createIndex('status', 'status', { unique: false });
    draftsStore.createIndex('tags', 'tags', { unique: false, multiEntry: true });
    console.log('Created drafts store');
  }
};

/**
 * Create a transaction for the specified object store
 * @param {string} storeName - Name of the object store
 * @param {string} mode - Transaction mode ('readonly' or 'readwrite')
 * @returns {Promise<IDBObjectStore>} Object store
 * @private
 */
const getObjectStore = async (storeName, mode = 'readonly') => {
  const db = await initDatabase();
  const transaction = db.transaction(storeName, mode);
  return transaction.objectStore(storeName);
};

/**
 * Migrate data from localStorage to IndexedDB
 * @returns {Promise<void>}
 * @private
 */
const migrateFromLocalStorage = async () => {
  // Check if migration has already been completed
  const migrationCompleted = localStorage.getItem('indexedDBMigrationComplete') === 'true';
  if (migrationCompleted) {
    console.log('Migration already completed, skipping');
    return;
  }
  
  console.log('Starting migration from localStorage to IndexedDB');
  
  try {
    // Get projects from localStorage
    const projectsJSON = localStorage.getItem('projects');
    if (!projectsJSON) {
      console.log('No projects found in localStorage, nothing to migrate');
      localStorage.setItem('indexedDBMigrationComplete', 'true');
      return;
    }
    
    // Parse projects
    const projects = JSON.parse(projectsJSON);
    console.log(`Found ${projects.length} projects to migrate`);
    
    // Initialize database
    const db = await initDatabase();
    
    // Start transaction
    const transaction = db.transaction(['projects', 'chapters'], 'readwrite');
    const projectStore = transaction.objectStore('projects');
    const chapterStore = transaction.objectStore('chapters');
    
    // Add each project to IndexedDB
    for (const project of projects) {
      // Generate a proper UUID if the project doesn't have an ID
      if (!project.id) {
        project.id = crypto.randomUUID();
      }
      
      // Set timestamps if missing
      if (!project.created) {
        project.created = new Date().toISOString();
      }
      if (!project.modified) {
        project.modified = new Date().toISOString();
      }
      
      // Get project-specific data
      const input = localStorage.getItem(`${project.name}-input`) || '';
      const outputJSON = localStorage.getItem(`${project.name}-output`) || '[]';
      const chapter = localStorage.getItem(`${project.name}-chapter`) || '';
      const chapterUrl = localStorage.getItem(`${project.name}-chapter-url`) || '';
      const chatGPTUrl = localStorage.getItem(`${project.name}-chatgpt-url`) || '';
      
      // Add these to the project object
      project.input = input;
      project.output = outputJSON;
      project.chatGPTUrl = chatGPTUrl;
      
      // Initialize settings if missing
      if (!project.settings) {
        project.settings = {
          translationMethod: 'chatgpt',
          openRouterApiKey: '',
          openRouterModel: '',
          autoVerify: false,
          customChunkSize: 1000,
          chunkingStrategy: 'auto'
        };
      }
      
      // Add the project to IndexedDB
      projectStore.add(project);
      console.log(`Migrated project: ${project.name}`);
      
      // If there's chapter data, save it as a chapter
      if (chapter && chapterUrl) {
        const chapterObj = {
          id: crypto.randomUUID(),
          projectId: project.id,
          title: project.currentChapterName || 'Imported Chapter',
          content: chapter,
          url: chapterUrl,
          prevLink: project.currentChapter && project.currentChapter.prevLink ? project.currentChapter.prevLink : '',
          nextLink: project.currentChapter && project.currentChapter.nextLink ? project.currentChapter.nextLink : '',
          dateAdded: new Date().toISOString()
        };
        
        chapterStore.add(chapterObj);
        console.log(`Migrated chapter for project: ${project.name}`);
      }
    }
    
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        console.log('Migration from localStorage completed successfully');
        localStorage.setItem('indexedDBMigrationComplete', 'true');
        resolve();
      };
      
      transaction.onerror = (event) => {
        console.error('Migration error:', event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('Error during migration:', error);
    throw error;
  }
};

/**
 * Main Storage Service factory
 * Provides methods for database operations
 */
const StorageService = {
  /**
   * Initialize database and run migrations
   * @returns {Promise<void>}
   */
  initialize: async () => {
    console.log('Initializing database service');
    
    try {
      await initDatabase();
      await migrateFromLocalStorage();
      console.log('Database service initialized successfully');
    } catch (error) {
      console.error('Error initializing database service:', error);
      throw error;
    }
  },
  
  /**
   * Save an item to the specified object store
   * @param {string} storeName - Name of the object store
   * @param {Object} item - Item to save
   * @returns {Promise<any>} Result of the operation
   */
  saveItem: async (storeName, item) => {
    try {
      const store = await getObjectStore(storeName, 'readwrite');
      
      return new Promise((resolve, reject) => {
        const request = store.put(item);
        
        request.onsuccess = (event) => {
          resolve(event.target.result);
        };
        
        request.onerror = (event) => {
          console.error(`Error saving to ${storeName}:`, event.target.error);
          reject(event.target.error);
        };
      });
    } catch (error) {
      console.error(`Error in saveItem for ${storeName}:`, error);
      throw error;
    }
  },
  
  /**
   * Get an item from the specified object store by key
   * @param {string} storeName - Name of the object store
   * @param {string|number} key - Key of the item to retrieve
   * @returns {Promise<any>} Retrieved item
   */
  getItem: async (storeName, key) => {
    try {
      const store = await getObjectStore(storeName);
      
      return new Promise((resolve, reject) => {
        const request = store.get(key);
        
        request.onsuccess = (event) => {
          resolve(event.target.result);
        };
        
        request.onerror = (event) => {
          console.error(`Error getting from ${storeName}:`, event.target.error);
          reject(event.target.error);
        };
      });
    } catch (error) {
      console.error(`Error in getItem for ${storeName}:`, error);
      throw error;
    }
  },
  
  /**
   * Get all items from the specified object store
   * @param {string} storeName - Name of the object store
   * @returns {Promise<Array>} All items in the store
   */
  getAllItems: async (storeName) => {
    try {
      const store = await getObjectStore(storeName);
      
      return new Promise((resolve, reject) => {
        const request = store.getAll();
        
        request.onsuccess = (event) => {
          resolve(event.target.result);
        };
        
        request.onerror = (event) => {
          console.error(`Error getting all from ${storeName}:`, event.target.error);
          reject(event.target.error);
        };
      });
    } catch (error) {
      console.error(`Error in getAllItems for ${storeName}:`, error);
      throw error;
    }
  },
  
  /**
   * Delete an item from the specified object store by key
   * @param {string} storeName - Name of the object store
   * @param {string|number} key - Key of the item to delete
   * @returns {Promise<void>} Result of the operation
   */
  deleteItem: async (storeName, key) => {
    try {
      const store = await getObjectStore(storeName, 'readwrite');
      
      return new Promise((resolve, reject) => {
        const request = store.delete(key);
        
        request.onsuccess = () => {
          resolve();
        };
        
        request.onerror = (event) => {
          console.error(`Error deleting from ${storeName}:`, event.target.error);
          reject(event.target.error);
        };
      });
    } catch (error) {
      console.error(`Error in deleteItem for ${storeName}:`, error);
      throw error;
    }
  },
  
  /**
   * Get items by an index value
   * @param {string} storeName - Name of the object store
   * @param {string} indexName - Name of the index
   * @param {any} value - Value to search for
   * @returns {Promise<Array>} Matching items
   */
  getByIndex: async (storeName, indexName, value) => {
    try {
      const store = await getObjectStore(storeName);
      const index = store.index(indexName);
      
      return new Promise((resolve, reject) => {
        const request = index.getAll(value);
        
        request.onsuccess = (event) => {
          resolve(event.target.result);
        };
        
        request.onerror = (event) => {
          console.error(`Error getting by index from ${storeName}:`, event.target.error);
          reject(event.target.error);
        };
      });
    } catch (error) {
      console.error(`Error in getByIndex for ${storeName}:`, error);
      throw error;
    }
  },
  
  /**
   * Clear all data from the specified object store
   * @param {string} storeName - Name of the object store
   * @returns {Promise<void>} Result of the operation
   */
  clearStore: async (storeName) => {
    try {
      const store = await getObjectStore(storeName, 'readwrite');
      
      return new Promise((resolve, reject) => {
        const request = store.clear();
        
        request.onsuccess = () => {
          resolve();
        };
        
        request.onerror = (event) => {
          console.error(`Error clearing ${storeName}:`, event.target.error);
          reject(event.target.error);
        };
      });
    } catch (error) {
      console.error(`Error in clearStore for ${storeName}:`, error);
      throw error;
    }
  },
  
  /**
   * Generate a UUID (Universal Unique Identifier)
   * @returns {string} A UUID
   */
  generateUUID: () => {
    return crypto.randomUUID();
  },
  
  /**
   * Save a setting to local storage
   * @param {string} key - Setting key
   * @param {any} value - Setting value
   */
  saveSetting: (key, value) => {
    localStorage.setItem(key, JSON.stringify(value));
  },
  
  /**
   * Get a setting from local storage
   * @param {string} key - Setting key
   * @param {any} defaultValue - Default value if setting doesn't exist
   * @returns {any} Retrieved setting
   */
  getSetting: (key, defaultValue = null) => {
    const value = localStorage.getItem(key);
    if (value === null) return defaultValue;
    try {
      return JSON.parse(value);
    } catch (e) {
      return value;
    }
  }
};

// Add the default export that was missing
export default StorageService;