const EventEmitter = require('events');

class PlaybackEngine extends EventEmitter {
  constructor(wss = null) {
    super();
    this.wss = wss;
    this.activeCues = new Map();
    this.context = null; 
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
