const { randomUUID } = require('crypto');
const path = require('path');

/** BasePlugin
 * extends this class to create new plugins
 * add new plugin class to index.js StackManager.registerCueClasses({NewPlugin});
 * Here is an exemple Plugin

class NewPlugin extends BasePlugin {
  constructor(config = {}) {
    super(config);
  }
  
  async start() {
    throw new Error('start() must be implemented by plugin subclasses.');
  }

  async stop() {
    throw new Error('stop() must be implemented by plugin subclasses.');
  }

  async pause() {
    throw new Error('pause() must be implemented by plugin subclasses.');
  }

  async resume() {
    throw new Error('resume() must be implemented by plugin subclasses.');
  }

  async stopAudioOnly() {
    //optional handler: by default stop all
    this.stop();
  }

  async stopVideoOnly() {
    //optional handler: by default stop all
    this.stop();
  }

  async setFullscreen() {
    //optional handler: if the plugin is fullscreen-able
    return;
  }

  serialize() {
    let output = super.serialize();
    output.type = 'NewPlugin';
    return {
      ...output,
      additional: value
    }
  }
  
  getUiColor() {    
    return '#ffffff';  ;
  }
  getUiIcon() { return '🔌'; }

  getUiConfig() {
    return {
      tabs: [
        ...super.getUiConfig().tabs,
        {
          label: 'New Tab',
          fields: [
            { key: 'additional', label: 'Additional Property', type: 'text' }
          ],
        }
      ]
    };
  }
}

module.exports = NewPlugin;

 */

class BasePlugin {
  constructor(config = {}) {
    this.id = config.id || `cue-${randomUUID().split('-').slice(0, 2).join('-')}`;
    this.type = config.type || 'UnknownPlugin';
    this.name = config.name || 'New Cue';
    this.triggerType = config.triggerType || 'manually';
    this.delay = Number.parseInt(config.delay, 10) || 0;
    this.loop = Boolean(config.loop);
    this.feeds = config.feeds || { audio: true, video: true };
    this.duration = config.duration;
    this.stopAudio = config.stopAudio;
    this.stopVideo = config.stopVideo;
    this.engine = null;
    this.mediaRoot = null;
    this.showRoot = null;
    this.triggeredAt = null;
    this.startedAt = null;
    this.pausedAt = null;
    this.timeoutid = null;
    this.stopAt = null;
  }

  setEngine(engine) {
    this.engine = engine;
    // On vérifie si l'engine a une méthode de registre
    if (this.engine.registerCue) {
      this.engine.registerCue(this);
    }
  }

  setStackContext({ mediaRoot, showRoot }) {
    this.mediaRoot = mediaRoot;
    this.showRoot = showRoot;
  }

  resolveMediaAsset(filename) {
    if (!filename) return '';

    // Si le chemin est déjà absolu, on le garde tel quel
    if (path.isAbsolute(filename)) {
      return filename;
    }

    // Sinon on résout par rapport au dossier média de la stack
    if (!this.mediaRoot) {
      console.warn(`Warning: mediaRoot not set for ${this.id}. Returning filename only.`);
      return filename;
    }

    return path.resolve(this.mediaRoot, filename);
  }

  // Méthode interne partagée
  async _executeStart() {
    if (this.stopAudio) { this.engine.stopAllAudio(); }
    if (this.stopVideo) { this.engine.stopAllVideo(); }
    this.engine.notifyCueStarted(this);
    this.startedAt = Date.now();
    this.timeoutid = null;
    this.pausedAt = null;
    this.stopAt = null;
    this.triggeredAt = null;
    return await this.start();
  }

  onComplete() {
    if (this.engine && !this.stopAt) {
      console.log(`[${this.name}] Execution terminated`);
      this.engine.notifyCueComplete(this);
    }
  }

  async previousStarted() {
    if (this.triggerType === 'with_previous') {
      console.log(`[${this.name}] Action scheduled: starting with previous cue (delay: ${this.delay}ms)`);
      this.timeoutid = setTimeout(() => this._executeStart(), this.delay);
      this.triggeredAt = Date.now();
    }
  }

  async previousCompleted() {
    if (this.triggerType === 'after_previous') {
      console.log(`[${this.name}] Action scheduled: starting after previous cue (delay: ${this.delay}ms)`);
      this.timeoutid = setTimeout(() => this._executeStart(), this.delay);
      this.triggeredAt = Date.now();
    }
  }

  // Appelé par l'API (Forçage manuel)
  async forceStart() {
    console.log(`[${this.name}] Forced start : starting immediately.`);
    if (this.timeoutid) { clearTimeout(this.timeoutid); this.timeoutid = null; this.triggeredAt = null; this.pausedAt = null; }
    return await this._executeStart();
  }


  async start() {
    throw new Error('start() must be implemented by plugin subclasses.');
  }

  async stop() {
    throw new Error('stop() must be implemented by plugin subclasses.');
  }

  async pause() {
    throw new Error('pause() must be implemented by plugin subclasses.');
  }

  async resume() {
    throw new Error('resume() must be implemented by plugin subclasses.');
  }

  async stopAudioOnly() {
    //optional handler
    this.stop();
  }

  async stopVideoOnly() {
    //optional handler
    this.stop();
  }

  async setFullscreen() {
    //optional handler
    return;
  }


  async triggerStop() {
    if (this.startedAt) {
      this.stop();
      this.stopAt = Date.now();
      this.startedAt = null;
    } else {
      clearTimeout(this.timeoutid);
      this.timeoutid = null;
      this.triggeredAt = null;
      this.pausedAt = null;
    }
    console.log(`[${this.name}] Stop Signal executed`);
  }


  async triggerPause() {
    if (this.startedAt) {
      this.pause();
    } else {
      clearTimeout(this.timeoutid);
      this.timeoutid = null;
      this.pausedAt = Date.now();
    }
    console.log(`[${this.name}] Pause Signal executed`);
  }


  async triggerResume() {
    if (this.pausedAt) {
      let newDelay = ((this.delay / 1000) - (this.pausedAt - this.triggeredAt)) * 1000;
      console.log(`[${this.name}] delay was ${this.delay}ms, newDelay is ${newDelay}ms`)
      this.triggeredAt = Date.now() + (newDelay - this.delay) / 1000;
      this.timeoutid = setTimeout(() => this._executeStart(), newDelay);
      this.pausedAt = null;
    } else {
      this.resume();
    }
    console.log(`[${this.name}] Resume Signal executed`);
  }


  serialize() {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      triggerType: this.triggerType,
      delay: this.delay,
      loop: this.loop,
      stopVideo: this.stopVideo,
      stopAudio: this.stopAudio,
      duration: this.duration,
      feeds: this.feeds,
    };
  }

  setConfigFields(key, value) {
    this[key] = value;
  }

  getConfigFields(key) {
    return this[key];
  }

  getUiColor() {
    return '#636363';
  }

  getUiIcon() {
    return '';
  }

  getUiConfig() {
    return {
      tabs: [
        {
          label: 'General',
          fields: [
            {
              key: 'name',
              label: 'Name',
              type: 'text',
            },
            {
              key: 'stopVideo',
              label: 'Stop Video',
              type: 'toggle'
            },
            {
              key: 'stopAudio',
              label: 'Stop Audio',
              type: 'toggle'
            },
            {
              key: 'triggerType',
              label: 'Trigger',
              type: 'select',
              options: [
                { value: 'manually', label: 'Manually' },
                { value: 'with_previous', label: 'With Previous' },
                { value: 'after_previous', label: 'After Previous' },
              ],
            },
            {
              key: 'duration',
              label: 'Duration (ms)',
              type: 'number',
              min: 0,
              readonly: true,
            },
            {
              key: 'delay',
              label: 'Delay (ms)',
              type: 'number',
              min: 0,
            },
          ]
        }
      ]
    };
  }

}

module.exports = BasePlugin;
