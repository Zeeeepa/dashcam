import { ref } from '../websocket/server.js';
import { verifyPattern, updateTabsState } from './helpers.js';
import { logger } from '../logger.js';

const endMessage = {
  type: 'STOP_RECORDING',
};

// Simple reactive implementations (simplified versions for CLI)
function reactive(obj) {
  return obj;
}

function computed(fn) {
  return { get value() { return fn(); } };
}

function effect(fn) {
  fn();
  return fn;
}

class WebTrackerManager {
  constructor(server) {
    this.tabs = {};
    this.cleanups = [];
    this.server = server;
    this.isListening = ref(server.isListening?.value || false);
    this.patternsByCallback = reactive(new Map());
    this.globalTabsAndNavigationCallbacks = reactive(new Set());
    this.eventCallbacks = computed(
      () => new Set(this.patternsByCallback.keys())
    );

    this.watchCallbacksSizeEffect = effect(() => {
      const size =
        this.eventCallbacks.value.size +
        this.globalTabsAndNavigationCallbacks.size;
      const isListening = this.isListening.value;
      logger.debug('WebTrackerManager: Effect triggered', { size, isListening, shouldStart: isListening && size > 0 });
      if (!isListening || size === 0) {
        this.#stop();
      } else this.#start();
    });
  }

  get isStarted() {
    return this.cleanups.length > 0 && this.isListening.value;
  }

  #start() {
    if (!this.isListening.value) {
      logger.debug('WebTrackerManager: Not starting because WebSocket server is not listening');
      return;
    }
    
    if (this.cleanups.length > 0) {
      logger.debug('WebTrackerManager: Already started, skipping duplicate start');
      return;
    }
    
    // Collect all patterns from the patternsByCallback map
    const patterns = Array.from(new Set(this.patternsByCallback.values()));
    logger.info('WebTrackerManager: Starting tracking...', { patterns, callbackCount: this.patternsByCallback.size });
    
    const startMessage = {
      type: 'START_RECORDING',
      payload: patterns.length > 0 ? patterns : ['*'], // Default to all if no patterns
    };
    
    this.server.broadcast(startMessage);
    logger.info('WebTrackerManager: Broadcasted start message to all clients', { patterns });

    const messageCleanup = this.server.on('message', (event) => {
      logger.debug('WebTrackerManager: Received message from server', { eventType: event.type, hasPayload: !!event.payload });
      this.#handleEvent(event);
    });
    const connectionCleanup = this.server.on('connection', (client) => {
      // Send current patterns to the new client
      const patterns = Array.from(new Set(this.patternsByCallback.values()));
      logger.info('WebTrackerManager: New client connected, sending start message', { 
        patterns, 
        callbackCount: this.patternsByCallback.size 
      });
      const startMessage = {
        type: 'START_RECORDING',
        payload: patterns.length > 0 ? patterns : ['*'],
      };
      this.server.send(client, startMessage);
    });

    this.cleanups.push(messageCleanup, connectionCleanup);
    logger.debug('WebTrackerManager: Started successfully, registered event handlers');
  }

  #stop() {
    logger.debug('WebTrackerManager: Stopping tracking...');
    if (this.isListening.value) {
      this.server.broadcast(endMessage);
      logger.debug('WebTrackerManager: Broadcasted stop message to all clients');
    }
    
    this.cleanups.forEach((cleanupFn) => cleanupFn());
    this.cleanups = [];
    logger.debug('WebTrackerManager: Stopped and cleaned up event handlers');
  }

  subscribeToGlobalTabsAndNavigation(callback) {
    logger.debug('WebTrackerManager: Subscribing to global tabs/navigation events');
    this.globalTabsAndNavigationCallbacks.add(callback);
    this.#tryCallback(callback, this.#getInitialTabs());
    // Manually trigger effect since we're using a simplified effect implementation
    const size =
      this.eventCallbacks.value.size +
      this.globalTabsAndNavigationCallbacks.size;
    if (this.isListening.value && size > 0) {
      this.#start();
    }
    return () => this.unsubscribeFromGlobalTabsAndNavigation(callback);
  }

  unsubscribeFromGlobalTabsAndNavigation(callback) {
    logger.debug('WebTrackerManager: Unsubscribing from global tabs/navigation events');
    this.globalTabsAndNavigationCallbacks.delete(callback);
  }

  subscribe(pattern, callback) {
    logger.info('WebTrackerManager: Subscribing to pattern', { pattern, isStarted: this.isStarted });
    this.patternsByCallback.set(callback, pattern);
    
    // If already started, send updated patterns to all clients
    if (this.cleanups.length > 0 && this.isListening.value) {
      const patterns = Array.from(new Set(this.patternsByCallback.values()));
      logger.info('WebTrackerManager: Sending updated patterns to clients', { patterns, callbackCount: this.patternsByCallback.size });
      const startMessage = {
        type: 'START_RECORDING',
        payload: patterns,
      };
      this.server.broadcast(startMessage);
    }
    
    // Manually trigger effect since we're using a simplified effect implementation
    const size =
      this.eventCallbacks.value.size +
      this.globalTabsAndNavigationCallbacks.size;
    if (this.isListening.value && size > 0) {
      this.#start();
    }
    return () => this.unsubscribe(callback);
  }

  unsubscribe(callback) {
    const pattern = this.patternsByCallback.get(callback);
    logger.debug('WebTrackerManager: Unsubscribing from pattern', { pattern });
    this.patternsByCallback.delete(callback);
  }

  /**
   * Get the DOM from a webpage through the Chrome extension
   * @param {Object} options - Execution options
   * @param {number} [options.tabId] - Specific tab ID (optional, uses active tab if not provided)
   * @param {string} [options.url] - URL pattern to match (optional)
   * @param {boolean} [options.allFrames=false] - Get from all frames
   * @returns {Promise<Object>} - Resolves with {html, title, url} from the page
   */
  getPageDOM({ tabId, url, allFrames = false } = {}) {
    return new Promise((resolve, reject) => {
      if (!this.isListening.value) {
        logger.error('WebTrackerManager: Cannot execute script, WebSocket server is not listening');
        return reject(new Error('WebSocket server is not listening'));
      }

      const requestId = `getdom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const message = {
        type: 'GET_PAGE_DOM',
        requestId,
        payload: {
          tabId,
          url,
          allFrames,
        },
      };

      logger.info('WebTrackerManager: Sending get page DOM request', { 
        requestId, 
        tabId, 
        url
      });

      // Set up one-time listener for the response
      const timeout = setTimeout(() => {
        logger.error('WebTrackerManager: Script execution timed out', { requestId });
        cleanup();
        reject(new Error('Script execution timed out'));
      }, 30000); // 30 second timeout

      const responseHandler = (event) => {
        logger.debug('WebTrackerManager: Received message in responseHandler', { 
          type: event.type, 
          requestId: event.requestId,
          matchesOurRequest: event.requestId === requestId 
        });
        
        if (event.type === 'DOM_RESULT' && event.requestId === requestId) {
          clearTimeout(timeout);
          cleanup();
          
          if (event.error) {
            logger.error('WebTrackerManager: Failed to get DOM', { 
              requestId, 
              error: event.error 
            });
            reject(new Error(event.error));
          } else {
            logger.info('WebTrackerManager: Got DOM successfully', { requestId });
            resolve(event.result);
          }
        }
      };

      const cleanup = this.server.on('message', responseHandler);
      this.server.broadcast(message);
    });
  }

  #getInitialTabs(time = Date.now()) {
    return {
      time,
      type: 'INITIAL_TABS',
      payload: Object.values(this.tabs).map(({ previousUrl, ...tab }) => tab),
    };
  }

  #shouldSendEvent(pattern, event, cache = {}) {
    if (cache[pattern] !== undefined) return cache[pattern];

    const tab = this.tabs[event.payload.tabId];
    if (tab) {
      const urlMatches = verifyPattern(pattern, tab.url);
      const previousUrlMatches = verifyPattern(pattern, tab.previousUrl);
      
      logger.info('WebTrackerManager: Checking pattern match', {
        pattern,
        tabUrl: tab.url,
        previousUrl: tab.previousUrl,
        urlMatches,
        previousUrlMatches,
        willMatch: urlMatches || previousUrlMatches
      });
      
      if (urlMatches || previousUrlMatches) {
        cache[pattern] = true;
      } else {
        cache[pattern] = false;
      }
    } else {
      cache[pattern] = false;
      logger.debug('WebTrackerManager: Tab not found in tabs map', {
        tabId: event.payload.tabId,
        availableTabs: Object.keys(this.tabs).length
      });
    }

    return cache[pattern];
  }

  #handleEvent(event) {
    logger.info('WebTrackerManager: Received event', { 
      type: event.type, 
      tabId: event.payload?.tabId,
      url: event.payload?.url?.substring(0, 100),
      requestUrl: event.payload?.requestUrl?.substring(0, 100)
    });
    
    this.tabs = updateTabsState(event, this.tabs);
    const { payload, type } = event;
    switch (type) {
      case 'INITIAL_TABS':
      case 'TAB_REMOVED':
      case 'TAB_ACTIVATED':
      case 'NAVIGATION_STARTED':
      case 'NAVIGATION_COMPLETED':
        logger.debug('WebTrackerManager: Broadcasting global tabs/navigation event', { type, tabCount: event.payload?.length || 1 });
        this.globalTabsAndNavigationCallbacks.forEach((callback) => {
          this.#tryCallback(callback, event);
        });
        break;

      default:
        const cache = {};
        let matchedCallbacks = 0;
        
        logger.info('WebTrackerManager: Processing non-nav event', {
          type,
          callbackCount: this.eventCallbacks.value.size,
          patternCount: this.patternsByCallback.size
        });
        
        this.eventCallbacks.value.forEach((callback) => {
          const pattern = this.patternsByCallback.get(callback);
          logger.info('WebTrackerManager: Checking callback', { pattern, hasPattern: !!pattern });
          if (pattern && this.#shouldSendEvent(pattern, event, cache)) {
            logger.debug('WebTrackerManager: Event matches pattern, sending to callback', { 
              type, 
              pattern,
              tabUrl: this.tabs[event.payload?.tabId]?.url?.substring(0, 100)
            });
            this.#tryCallback(callback, event);
            matchedCallbacks++;
          }
        });
        
        if (matchedCallbacks === 0) {
          const availablePatterns = Array.from(this.patternsByCallback.values());
          logger.debug('WebTrackerManager: Event did not match any patterns', { 
            type, 
            tabId: event.payload?.tabId,
            tabUrl: this.tabs[event.payload?.tabId]?.url,
            availablePatterns,
            totalTabs: Object.keys(this.tabs).length
          });
        }
    }
  }

  #tryCallback(callback, event) {
    try {
      callback(event);
    } catch (error) {
      logger.error(
        'Failed sending ExtensionTracker event',
        { event, error }
      );
    }
  }

  destroy() {
    this.#stop();
    this.patternsByCallback.clear();
    this.globalTabsAndNavigationCallbacks.clear();
  }
}

export { WebTrackerManager, reactive, computed, effect };
