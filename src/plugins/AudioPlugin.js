const { spawn } = require('child_process');
const path = require('path');
const BasePlugin = require('../BasePlugin');

class AudioPlugin extends BasePlugin {
  constructor(config = {}) {
    super(config);
    this.file = config.file || '';
    this.instances = new Map();
    this.wsServer = null;
    this.peakInterval = null;
    this._completeResolver = null;
    this._completionPromise = new Promise((resolve) => {
      this._completeResolver = resolve;
    });
  }

  attachWebSocketServer(wsServer) {
    this.wsServer = wsServer;
  }

  _resolveFile(file) {
    if (!file) {
      throw new Error('No audio file provided.');
    }

    if (path.isAbsolute(file)) {
      return file;
    }

    return this.resolveMediaAsset(file);
  }

  _spawnMpv(file, extraArgs = []) {
    const args = [file, '--quiet', '--force-window=no', '--no-video', ...extraArgs];
    return spawn('mpv', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  }

  _registerProcess(instanceId, mpvProcess) {
    this.instances.set(instanceId, mpvProcess);

    mpvProcess.stdout.on('data', (chunk) => {
      this._broadcastPeakLevels({ sourceId: instanceId, sample: chunk.toString('utf8') });
    });

    mpvProcess.stderr.on('data', (chunk) => {
      this._broadcastPeakLevels({ sourceId: instanceId, sample: chunk.toString('utf8') });
    });

    mpvProcess.on('close', () => {
      this.instances.delete(instanceId);
      if (!this.instances.size) {
        clearInterval(this.peakInterval);
        this.onComplete();
        this._completeResolver();
      }
    });
  }

  _startPeakBroadcast() {
    if (!this.wsServer || this.peakInterval) {
      return;
    }

    this.peakInterval = setInterval(() => {
      this._broadcastPeakLevels({ type: 'heartbeat' });
    }, 250);
  }

  _broadcastPeakLevels(payload) {
    if (!this.wsServer) {
      return;
    }

    const message = JSON.stringify({ cueId: this.id, timestamp: Date.now(), payload });
    this.wsServer.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(message);
      }
    });
  }

  async start() {
    if (!this.file) {
      this.onComplete();
      this._completeResolver();
      return this._completionPromise;
    }

    const resolvedFile = this._resolveFile(this.file);
    const mpvProcess = this._spawnMpv(resolvedFile, this.loop ? ['--loop=inf'] : []);
    this._registerProcess(this.id, mpvProcess);
    this._startPeakBroadcast();
    return this._completionPromise;
  }

  stop() {
    this.instances.forEach((mpvProcess) => {
      mpvProcess.kill('SIGTERM');
    });
  }

  stopAudioOnly() {
    this.stop();
  }

  stopVideoOnly() {
    // No-op: this plugin controls audio only.
  }

  serialize() {
    return {
      type: 'AudioPlugin',
      id: this.id,
      name: this.name,
      triggerType: this.triggerType,
      delay: this.delay,
      loop: this.loop,
      file: this.file,
      previousCueId: this.previousCueId,
    };
  }

  getUIConfig() {
    return {
      fields: [
        {
          key: 'triggerType',
          label: 'Trigger',
          type: 'select',
          options: [
            { value: 'with_previous', label: 'With Previous' },
            { value: 'after_previous', label: 'After Previous' },
          ],
        },
        {
          key: 'delay',
          label: 'Delay (ms)',
          type: 'number',
          min: 0,
          step: 100,
        },
        {
          key: 'loop',
          label: 'Loop Audio',
          type: 'toggle',
        },
        {
          key: 'file',
          label: 'Audio File',
          type: 'filePicker',
          accept: 'audio/*',
        },
      ],
    };
  }
}

module.exports = AudioPlugin;
