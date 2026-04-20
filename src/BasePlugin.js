const path = require('path');

class BasePlugin {
  constructor(config = {}) {
    this.id = config.id || `cue-${Date.now()}-${Math.round(Math.random() * 1000)}`;
    this.name = config.name || 'Unnamed Plugin';
    this.triggerType = config.triggerType || 'with_previous';
    this.delay = Number.parseInt(config.delay, 10) || 0;
    this.loop = Boolean(config.loop);
    this.feeds = config.feeds || { audio: true, video: true };
    this.previousCueId = config.previousCueId || null;
    this.engine = null;
    this.mediaRoot = null;
    this.showRoot = null;
    this._started = false;
  }

  setEngine(engine) {
    this.engine = engine;
    this.engine.registerCue(this);
  }

  setStackContext({ mediaRoot, showRoot }) {
    this.mediaRoot = mediaRoot;
    this.showRoot = showRoot;
  }

  resolveMediaAsset(filename) {
    if (!this.mediaRoot) {
      throw new Error('Media root has not been assigned to plugin. Call setStackContext() first.');
    }

    return path.resolve(this.mediaRoot, filename);
  }

  async trigger() {
    if (!this.engine) {
      throw new Error('Plugin engine is not attached. Call setEngine() before trigger().');
    }

    const startAction = async () => {
      if (this._started) return;
      this._started = true;
      this.engine.notifyCueStarted(this);

      try {
        const started = await this.start();
        return started;
      } catch (error) {
        throw error;
      }
    };

    return new Promise((resolve, reject) => {
      const schedule = () => {
        setTimeout(() => {
          startAction()
            .then(resolve)
            .catch(reject);
        }, this.delay);
      };

      if (this.triggerType === 'with_previous') {
        schedule();
        return;
      }

      if (this.triggerType === 'after_previous') {
        if (!this.previousCueId) {
          reject(new Error('after_previous trigger requires previousCueId to be set.'));
          return;
        }

        this.engine.once(`cueComplete:${this.previousCueId}`, schedule);
        return;
      }

      reject(new Error(`Unsupported triggerType: ${this.triggerType}`));
    });
  }

  onComplete() {
    if (!this.engine) return;
    this.engine.notifyCueComplete(this);
  }

  serialize() {
    throw new Error('serialize() must be implemented by plugin subclasses.');
  }

  getUIConfig() {
    throw new Error('getUIConfig() must be implemented by plugin subclasses.');
  }

  async start() {
    throw new Error('start() must be implemented by plugin subclasses.');
  }

  async stop() {
    this.onComplete();
  }
}

module.exports = BasePlugin;
