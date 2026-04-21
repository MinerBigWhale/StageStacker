const { spawn } = require('child_process');
const path = require('path');
const BasePlugin = require('../BasePlugin');
const ffmpeg = require('fluent-ffmpeg');

class VideoPlugin extends BasePlugin {
  constructor(config = {}) {
    super(config);
    this._file = config.file || '';
    this.muted = Boolean(config.muted);
    this.instances = new Map();
    this.wsServer = null;
    this.peakInterval = null;
    this._completeResolver = null;
    this._completionPromise = new Promise((resolve) => {
      this._completeResolver = resolve;
    });
    this.metadata = '';
  }

  setStackContext({ mediaRoot, showRoot }) {
    super.setStackContext({ mediaRoot, showRoot });
    if (this._file) this.getMetadata();
  }

  attachWebSocketServer(wsServer) {
    this.wsServer = wsServer;
  }

  get file() {
    return this._file;
  }

  set file(file) {
    this._file = file;
    this.getMetadata();
  }

  async getMetadata() {
    if (!this._file) {
      this.metadata = 'No video file provided.';
      return;
    }

    try {
      this.metadata = await new Promise((resolve) => {
        ffmpeg.ffprobe(this.resolveMediaAsset(this._file), (err, metadata) => {
          if (err) return resolve(`Error retrieving metadata: ${err.message}`);

          const format = metadata.format || {};
          const audio = metadata.streams.find(s => s.codec_type === 'audio') || {};
          const video = metadata.streams.find(s => s.codec_type === 'video') || {};

          const duration = format.duration 
            ? `${Math.floor(format.duration / 60)}:${Math.floor(format.duration % 60).toString().padStart(2, '0')}` 
            : 'unknown';

          // Utilisation de \t pour les tabulations réelles
          resolve(`author: ${format.tags?.artist || 'unknown'}
title: ${format.tags?.title || 'unknown'}
duration: ${duration}
Creation Time: ${format.tags?.creation_time || 'unknown'}
Video :
\tCodec: ${video.codec_long_name || 'unknown'}
\tDimensions: ${video.width ? `${video.width}x${video.height}` : 'unknown'}
\tAspect Ratio: ${video.display_aspect_ratio || 'unknown'}
\tFrame Rate: ${video.r_frame_rate ? eval(video.r_frame_rate).toFixed(2) : 'unknown'}
Audio :
\tCodec: ${audio.codec_long_name || 'unknown'}
\tChannels: ${audio.channels ? `${audio.channel_layout} (${audio.channels})` : 'unknown'}
\tBit Rate: ${audio.bit_rate || 'unknown'}`);
        });
      });
    } catch (e) {
      this.metadata = `Fatal Error: ${e.message}`;
    }
  }

  _spawnMpv(file, extraArgs = []) {
    const args = [
      file,
      '--quiet',
      '--force-window=yes',
      '--msg-level=cplayer=v', // Augmente la précision pour voir les stats
      '--term-status-msg=Audio-Out: ${audio-out-peak}', // Affiche les pics dans le flux
      ...extraArgs
    ];
    return spawn('mpv', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  }

  _registerProcess(instanceId, mpvProcess) {
  this.instances.set(instanceId, mpvProcess);

  const handleOutput = (chunk) => {
    const output = chunk.toString('utf8');
    
    // On ne broadcast que si la ligne contient des infos de peak
    // mpv affiche souvent les peaks sous cette forme avec l'argument term-status-msg
    if (output.includes('Audio-Out')) {
      this._broadcastPeakLevels({ 
        sourceId: instanceId, 
        sample: output.trim() 
      });
    }
  };

  mpvProcess.stdout.on('data', handleOutput);
  // Souvent mpv écrit les status sur stderr
  mpvProcess.stderr.on('data', handleOutput);

  mpvProcess.on('close', () => {
    this.instances.delete(instanceId);
    if (this.instances.size === 0) {
      if (this.peakInterval) clearInterval(this.peakInterval);
      this.peakInterval = null;
      
      this._started = false; // Important pour pouvoir relancer
      this.onComplete(); 
      if (this._completeResolver) this._completeResolver();
    }
  });
}

  _startPeakBroadcast() {
    if (!this.wsServer || this.peakInterval) return;
    this.peakInterval = setInterval(() => {
      this._broadcastPeakLevels({ type: 'heartbeat' });
    }, 250);
  }

  _broadcastPeakLevels(payload) {
    if (!this.wsServer) return;
    const message = JSON.stringify({ cueId: this.id, timestamp: Date.now(), payload });
    this.wsServer.clients.forEach((client) => {
      if (client.readyState === 1) client.send(message);
    });
  }

  async start() {
    if (!this._file) {
      this.onComplete();
      if (this._completeResolver) this._completeResolver();
      return this._completionPromise;
    }

    const resolvedFile = this.resolveMediaAsset(this._file);
    const args = [];
    if (this.loop) args.push('--loop=inf');
    if (this.muted) args.push('--no-audio');

    const mpvProcess = this._spawnMpv(resolvedFile, args);
    this._registerProcess(this.id, mpvProcess);
    this._startPeakBroadcast();
    
    return this._completionPromise;
  }

  async stop() { // Correction de asyncstop
    this.instances.forEach((mpvProcess) => {
      mpvProcess.kill('SIGTERM');
    });
  }

  async muteAudio() {
    this.instances.forEach((mpvProcess) => {
      // Pour MPV via IPC/Pipe, 'm' est le raccourci mute par défaut
      if (mpvProcess.stdin.writable) mpvProcess.stdin.write('m');
    });
  }

  async stopAudioOnly() { this.muteAudio(); }
  async stopVideoOnly() { this.stop(); }

  serialize() {
    let output = super.serialize();
    output.type = 'VideoPlugin';
    output.feeds = { video: true, audio: !this.muted };
    return {
      ...output,
      file: this._file,
      muted: this.muted,
      loop: this.loop,
    };
  }

  
  getUicolor() {    
    return '#810000';  ;
  }
  getUiIcon() { return '🎬'; }

  getUIConfig() {
    return {
      tabs: [
        ...super.getUIConfig().tabs,
        {
          label: 'Content',
          fields: [
            { key: 'file', label: 'Video File', type: 'filePicker', accept: 'video/*' },
            { key: 'loop', label: 'Loop Video', type: 'toggle' },
            { key: 'muted', label: 'Muted', type: 'toggle' }
          ],
        },
        {
          label: 'Media Info',
          fields: [
            { key: 'metadata', label: 'Metadata', type: 'info' }
          ],
        }
      ]
    };
  }
}

module.exports = VideoPlugin;
