import fs from 'fs';
import path from 'path';
import { APP } from './config.js';
import { logger } from './logger.js';

class Store {
  constructor(filename) {
    this.path = path.join(APP.configDir, `${filename}.json`);
    this.data = this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.path)) {
        const data = fs.readFileSync(this.path, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      logger.error('Failed to load store:', error);
    }
    return {};
  }

  save() {
    try {
      // Ensure directory exists
      fs.mkdirSync(path.dirname(this.path), { recursive: true });
      fs.writeFileSync(this.path, JSON.stringify(this.data, null, 2));
    } catch (error) {
      logger.error('Failed to save store:', error);
    }
  }

  get(key) {
    return this.data[key];
  }

  set(key, value) {
    this.data[key] = value;
    this.save();
  }

  delete(key) {
    delete this.data[key];
    this.save();
  }

  has(key) {
    return key in this.data;
  }

  clear() {
    this.data = {};
    this.save();
  }
}

export { Store };
