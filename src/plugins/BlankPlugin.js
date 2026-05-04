const BasePlugin = require('../BasePlugin');

class BlankPlugin extends BasePlugin {
  async start() { this.onComplete(); }
  async stop() { return; }
  async pause(){ return; }
  async resume(){ return; }
  async muteAudio() { return; }
  async resumeAudio() { return; }
  async stopAudioOnly() { return; }
  async stopVideoOnly() { return; }

  getUiColor() { return '#575757'; }
  getUiIcon() { return '🚫'; }
}

module.exports = BlankPlugin;
