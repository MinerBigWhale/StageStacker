const EventEmitter = require('events');
const Blackout = require('./Blackout');


class PlaybackEngine extends EventEmitter {
  constructor(wss = null) {
    super();
    this.wss = wss;
    this.activeCues = new Map();
    this.loadedCues = new Map();
    this.context = null; 
    this.isFullscreen = false;
    this.fullscreenNum = null;
    this.blackout = new Blackout(this);
    this.LastCue = 0;
  }

  toggleFullscreen(Active=true, ScrennNum = 1) {
      this.isFullscreen = Active;
      if (this.isFullscreen) {
          this.fullscreenNum = ScrennNum;
          this.blackout._showBlackout(['--fs-screen=' + this.fullscreenNum]);
      } else {
          this.blackout._hideBlackout(); 
      }    
      
      this.activeCues.forEach(cue => {
        cue.setFullscreen(this.isFullscreen);
      });

      this.wss.broadcast({ type: 'engine:fullscreen', active: this.isFullscreen, screenNum: this.fullscreenNum });
  }

  // L'index.js passera l'objet global qui contient la liste .cues
  setContext(context) {
    this.context = context;
  }

  /**
   * Enregistre une Cue et lui donne accès à l'engine
   */
  registerCue(cue) {
    cue.engine = this;
    if (cue.attachWebSocketServer && this.wss) {
      cue.attachWebSocketServer(this.wss);
    }
  }

  /**
   * Déclenche une Cue manuellement
   */
  async triggerCue(cue) {
    try {
      console.log(`[Engine] Triggering: ${cue.name} (${cue.id})`);
      this.loadedCues.set(cue.id, cue);
      return await cue.forceStart(); 
    } catch (err) {
      console.error(`[Engine] Error triggering cue:`, err);
    }
  }


  notifyCueStarted(cue) {
    this.wss.broadcast({ type: 'cue:started', data: { id: cue.id } });
    console.log(`[Engine] Cue ${cue.id} Started`);
    this.loadedCues.delete(cue.id);
    this.activeCues.set(cue.id, cue);
    this.LastCue = cue;
    const index = this.context.cues.findIndex(c => c.id === cue.id);
    const nextCue = this.context.cues[index + 1];
    if (nextCue) {
      nextCue.previousStarted().catch(e => console.error(e));
      this.loadedCues.set(nextCue.id, nextCue);
    }
  }

  notifyCueComplete(cue) {
    this.wss.broadcast({ type: 'cue:complete', data: { id: cue.id } });
    console.log(`[Engine] Cue ${cue.id} Completed`);
    this.activeCues.delete(cue.id);

    const index = this.context.cues.findIndex(c => c.id === cue.id);
    const nextCue = this.context.cues[index + 1];
    if (nextCue) {
      nextCue.previousCompleted().catch(e => console.error(e));
      this.loadedCues.set(nextCue.id, nextCue);
    }
  }

  async stopAll() {
    const stopPromises = [];
    this.loadedCues.forEach(cue => {
      stopPromises.push(cue.triggerStop());
    });
    await Promise.all(stopPromises);
    this.loadedCues.clear();
    this.activeCues.forEach(cue => {
      stopPromises.push(cue.triggerStop());
    });
    await Promise.all(stopPromises);
    this.activeCues.clear();
    console.log('[Engine] All cues stopped');
    this.wss.broadcast({ type: 'engine:all_stopped' });
  }
  
  async stopAllAudio() {
    const stopPromises = [];
    this.activeCues.forEach(cue => {
      stopPromises.push(cue.stopAudioOnly());
    });
    await Promise.all(stopPromises);
    console.log('[Engine] Audio cues stopped');
  }
  
  async stopAllVideo() {
    const stopPromises = [];
    this.activeCues.forEach(cue => {
      stopPromises.push(cue.stopVideoOnly());
    });
    await Promise.all(stopPromises);
    console.log('[Engine] Video cues stopped');
  }

  async pauseAll() {
    const pausePromises = [];
    this.loadedCues.forEach(cue => {
      pausePromises.push(cue.triggerPause());
    });
    this.activeCues.forEach(cue => {
      pausePromises.push(cue.triggerPause());
    });
    await Promise.all(pausePromises);
    console.log('[Engine] All cues paused');
    this.wss.broadcast({ type: 'engine:all_paused' });
  }

  async resumeAll() {
    const resumePromises = [];
    this.activeCues.forEach(cue => {
      resumePromises.push(cue.triggerResume());
    });
    await Promise.all(resumePromises);
    console.log('[Engine] All cues resumed');
    this.wss.broadcast({ type: 'engine:all_resumed' });
  }

  async forceNext(){
    await this.stopAll();
    const index = this.context.cues.findIndex(c => c.id === this.LastCue.id);
    const nextCue = this.context.cues[index + 1];
    this.triggerCue(nextCue);
  }

  broadcast(message) {
    if (!this.wss) return;
    const payload = JSON.stringify(message);
    this.wss.clients.forEach(client => {
      if (client.readyState === 1) client.send(payload);
    });
  }

  startPeakBroadcast() {
    if (wss) return;
    this.peakInterval = setInterval(() => {
      this.wss.broadcastPeakLevels({ type: 'heartbeat' });
    }, 250);
  }

  broadcastPeakLevels(payload) {
    this.activeCues.forEach(cue => {
      payload.push({ cue: cue.id, peaks: cue.peakValue, volume: cue.volume });
    });
    const message = JSON.stringify({ event: audio_peak, timestamp: Date.now(), payload : payload });
    this.wss.broadcast(message);
  }
}

module.exports = PlaybackEngine;
