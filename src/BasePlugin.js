const { randomUUID } = require('crypto');
const { read } = require('fs');
const path = require('path');

class BasePlugin {
  constructor(config = {}) {
    // Correction de la syntaxe du générateur d'ID
    this.id = config.id || `cue-${randomUUID().split('-').slice(0, 2).join('-')}`;
    this.type = config.type || 'UnknownPlugin';
    this.name = config.name || 'New Cue';
    this.triggerType = config.triggerType || 'manually';
    this.delay = Number.parseInt(config.delay, 10) || 0;
    this.loop = Boolean(config.loop);
    this.feeds = config.feeds || { audio: true, video: true };
    this.stopAudio = Boolean(config.stopAudio);
    this.stopVideo = Boolean(config.stopVideo);
    this.duration = Number.parseInt(config.duration, 10) || 0;
    this.engine = null;
    this.mediaRoot = null;
    this.showRoot = null;
    this._started = false;
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
    if (this._started && !this.loop) return;
    this._started = true;
    this.engine.notifyCueStarted(this);
    try {
      return await this.start();
    } catch (err) {
      this._started = false;
      throw err;
    }
  }

  // Appelé par l'Engine (Propagation automatique)
  async trigger() {
    // Si c'est manuel, on ignore la propagation automatique
    if (this.triggerType === 'manually') return;

    if (this.triggerType === 'with_previous') {
      console.log(`[${this.name}] Action scheduled: starting with previous cue (delay: ${this.delay}ms)`);
      setTimeout(() => this._executeStart(), this.delay);
    } 
    else if (this.triggerType === 'after_previous') {
      console.log(`[${this.name}] Action scheduled: waiting for previous cue to complete...`);
      
      this.engine.once('cueComplete', (previousCue) => {
        console.log(`[${this.name}] Previous cue (${previousCue.name}) completed. Starting in ${this.delay}ms`);
        setTimeout(() => this._executeStart(), this.delay);
      });
    }
  }

  // Appelé par l'API (Forçage manuel)
  async forceStart() {
    console.log(`[${this.name}] Forced start : starting immediately.`);
    return await this._executeStart();
  }


  onComplete() {
    this._started = false; // Reset pour permettre un nouveau trigger
    if (this.engine) {
      console.log(`[${this.name}] Execution terminated`);
      this.engine.notifyCueComplete(this);
    }
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

  getUicolor() {    
    return '#636363';  ;
  }
  
  getUiIcon() {    
    return ''  ;
  }

  getUIConfig() {
    return {
      tabs: [
        {
          label: 'General',
          fields: [
            {
              key : 'name',
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
  
  


  async start() {
    throw new Error('start() must be implemented by plugin subclasses.');
  }

  async stop() {
    throw new Error('stop() must be implemented by plugin subclasses.');
  }

  async stopAudioOnly() {
    throw new Error('stopAudioOnly must be implemented by plugin subclasses.');
  }

  async stopVideoOnly() {
    throw new Error('stopVideoOnly must be implemented by plugin subclasses.');
  }

}

module.exports = BasePlugin;
