const EventEmitter = require('events');
const kill = require('tree-kill');
const { spawn } = require('child_process');
const path = require('path');

class PlaybackEngine extends EventEmitter {
  constructor(wss = null) {
    super();
    this.wss = wss;
    this.activeCues = new Map();
    this.context = null; 
    this.isFullscreen = false;
    this.fullscreenNum = null;
    this.blackoutProcess = null;
  }

  toggleFullscreen(Active=true, ScrennNum = 1) {
    this.isFullscreen = Active;
    if (this.isFullscreen) {
        this.fullscreenNum = ScrennNum;
        const args = [];
        if (Active) args.push('--fullscreen');
        if (ScrennNum) args.push('--fs-screen=' + (ScrennNum ? ScrennNum - 1 : 'all'));
        this._showBlackout(args);
    } else {
        this._hideBlackout(); 
    }    
    // Notifier le front-end via WebSocket
    this.broadcast({ type: 'engine:fullscreen', value: this.isFullscreen });
  }

  
  _showBlackout(extraArgs = []) {
   
    console.log(`[Engine] Activating blackout on screen ${this.fullscreenNum || 'all'}`);
    if (this.blackoutProcess) return;
    this.blackoutProcess = spawn('mpv', [
      '--force-window=yes',
      '--background-color=#000000',
      '--idle=yes',
      '--keep-open=yes',
      '--player-operation-mode=pseudo-gui',
      '--no-osc',
      '--no-osd-bar',
      '--title=STAGE-BLACKOUT',
      ...extraArgs
    ]);


    this.blackoutProcess.stderr.on('data', (data) => {
        console.error(`[MPV Error]: ${data.toString()}`);
    });

    this.blackoutProcess.on('close', (code) => {
        console.warn(`[WARNING] Blackout closed (Exit Code: ${code})`);
        this.blackoutProcess = null;
        this.isFullscreen = false;
        this.broadcast({ type: 'engine:fullscreen', value: false });
    });
  }

  _hideBlackout() {
    if (this.blackoutProcess) {
      kill(this.blackoutProcess.pid, 'SIGTERM', (err) => {
        if (err) console.error(`Error stopping blackout process ${this.blackoutProcess.pid}:`, err);
      });
      this.blackoutProcess = null;
    }
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
      return await cue.trigger(); 
    } catch (err) {
      console.error(`[Engine] Error triggering cue ${cue.id}:`, err);
      this.broadcast({ type: 'cue:error', id: cue.id, error: err.message });
    }
  }

    // L'index.js passera l'objet global qui contient la liste .cues
  setContext(context) {
    this.context = context;
  }

  notifyCueStarted(cue) {
    this.activeCues.set(cue.id, cue);
    this.broadcast({ type: 'cue:started', data: { id: cue.id } });

    // Propagation automatique vers la suite de la liste du StackManager
    if (this.context && this.context.cues) {
      const index = this.context.cues.findIndex(c => c.id === cue.id);
      const nextCue = this.context.cues[index + 1];

      if (nextCue) {
        // On déclenche la logique automatique de la cue suivante
        nextCue.trigger().catch(e => console.error(e));
      }
    }
  }

  notifyCueComplete(cue) {
    this.activeCues.delete(cue.id);
    this.broadcast({ type: 'cue:complete', data: { id: cue.id } });
    
    // On émet pour les plugins en "after_previous"
    this.emit('cueComplete', cue);
  }

  /**
   * Arrête tout ce qui joue
   */
  async stopAll() {
    const stopPromises = [];
    this.activeCues.forEach(cue => {
      if (cue.stop) stopPromises.push(cue.stop());
    });
    await Promise.all(stopPromises);
    this.activeCues.clear();
    console.log('[Engine] All cues stopped');
    this.broadcast({ type: 'engine:all_stopped' });
  }

  broadcast(message) {
    if (!this.wss) return;
    const payload = JSON.stringify(message);
    this.wss.clients.forEach(client => {
      if (client.readyState === 1) client.send(payload);
    });
  }
}

module.exports = PlaybackEngine;
