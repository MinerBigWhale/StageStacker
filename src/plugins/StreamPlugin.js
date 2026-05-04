const { spawn } = require('child_process');
const kill = require('tree-kill');
const BasePlugin = require('../BasePlugin');
const ffmpeg = require('fluent-ffmpeg');
const { read } = require('fs');
const net = require('net');
const { randomUUID } = require('crypto');

class StreamPlugin extends BasePlugin {
  constructor(config = {}) {
    super(config);
    this._url = config.url;
    this.muted = Boolean(config.muted);
    this.mpvProcess = null;
    this.peakValue = null;
    this.ipcPath = null;
    this.metadata = '';
  }

  sendIpcCommand(commandArray) {
      const client = net.connect(this.ipcPath, () => {
          const jsonRequest = JSON.stringify({
              command: commandArray
          });
          client.write(jsonRequest + '\n');
      });

      client.on('data', (data) => {
          const messages = data.toString().split('\n').filter(msg => msg.trim());
          
          messages.forEach(msg => {
              const response = JSON.parse(msg);
              console.log(`[StreamPlugin] ${this.id}-ipc:`, response);
          });
          client.destroy(); 
      });

      client.on('error', (err) => {
          console.error("IPC Connection Error:", err.message);
      });
  }

  setStackContext({ mediaRoot, showRoot }) {
    super.setStackContext({ mediaRoot, showRoot });
    if (this._url) this.getMetadata();
  }

  get url() {
    return this._url;
  }

  set url(url) {
    this._url = url;
    this.getMetadata();
  }
  
  async start() {
    if (!this._url) return;
    if (this.mpvProcess) return;

    const extraArgs = [];
    if (this.loop) extraArgs.push('--loop=inf');
    if (this.muted) extraArgs.push('--no-audio');

    if (this.engine.isFullscreen) {
      extraArgs.push('--fullscreen');
      extraArgs.push('--fs-screen=' + this.engine.fullscreenNum);
    }

    
    const randid= randomUUID().split('-')[3];

    this.ipcPath = process.platform === 'win32' 
        ? `\\\\.\\pipe\\mpv-${this.id}-${randid}` 
        : `/tmp/mpv-${this.id}-${randid}.sock`;

    console.log(`[StreamPlugin] cue:${this.id} set ipcPath:${this.ipcPath}`)
    
    this.mpvProcess = spawn('mpv', [
      this._url,
      '--ytdl=yes', '--ytdl-format=bestvideo[height<=?1080][vcodec^=avc1]+bestaudio/best[height<=?1080]', '--hwdec=auto-safe',
      '--quiet', '--force-window=yes', '--ontop',
      `--input-ipc-server=${this.ipcPath}`,
      ...extraArgs
    ]);
    
    this.mpvProcess.stderr.on('data', (data) => {
      console.error(`[MPV ${this.id}]: ${data.toString()}`);
    });

    this.mpvProcess.stdout.on('data', (data) => {
      //console.info(`[MPV ${this.id}]: ${data.toString()}`);
    });

    this.mpvProcess.on('close', (code) => {
      console.warn(`[StreamPlugin] MPV closed (Exit Code: ${code})`);
      this.mpvProcess = null;
      this.onComplete();
    });
  }

  async stop() { 
    console.log(`[StreamPlugin] Stopping all instances of cue ${this.id}`);
    kill(this.mpvProcess.pid, 'SIGTERM', (err) => {
      if (err) console.error(`Error stopping process:`, err);
    });
  }

  async pause(){
    this.sendIpcCommand(["set_property", "pause", true]);
  }

  async resume(){
    this.sendIpcCommand(["set_property", "pause", false]);
  }

 
  async muteAudio() {
    return this.sendIpcCommand(["set_property", "mute", true]);
  }

  async resumeAudio() {
    return this.sendIpcCommand(["set_property", "mute", false]);
  }


  async stopAudioOnly() { this.muteAudio(); }
  async stopVideoOnly() { this.stop(); }

  serialize() {
    let output = super.serialize();
    output.type = 'StreamPlugin';
    output.feeds = { video: true, audio: !this.muted };
    return {
      ...output,
      url: this._url,
      muted: this.muted,
      loop: this.loop,
    };
  }

  

  async getMetadata() {
    if (!this._url) {
      this.metadata = 'No video url provided.';
      return;
    }

       // Use yt-dlp to get detailed info
    exec(`yt-dlp --dump-json --flat-playlist "${this._url}"`, (error, stdout, stderr) => {
      if (error) {
        this.metadata = `yt-dlp Error: ${error.message}`;
        return;
      }

      try {
        const info = JSON.parse(stdout);
        
        // Format the metadata display
        this.metadata = [
          `Title: ${info.title || 'unknown'}`,
          `Uploader: ${info.uploader || info.uploader_id || 'unknown'}`,
          `Duration: ${info.duration_string || 'Live'}`,
          `View Count: ${info.view_count || 'N/A'}`,
          `Upload Date: ${info.upload_date || 'unknown'}`,
          `Resolution: ${info.width}x${info.height}`,
          `Format: ${info.format_note || info.ext}`,
          `Description: ${(info.description || '').substring(0, 100)}...`
        ].join('\n');

        // Update internal duration for logic
        this.duration = info.duration || 0;
      } catch (e) {
        this.metadata = `Parsing Error: ${e.message}`;
      }
    });
  }
  
  getUiColor() {    
    return '#059900';  ;
  }
  getUiIcon() { return '🌐'; }

  getUiConfig() {
    return {
      tabs: [
        ...super.getUiConfig().tabs,
        {
          label: 'Content',
          fields: [
            { key: 'url', label: 'Stream URL', type: 'text' },
            { key: 'loop', label: 'Loop Video', type: 'toggle' },
            { key: 'muted', label: 'Muted', type: 'toggle' }
          ],
        },
        {
          label: 'Media Info',
          fields: [
            { key: 'metadata', label: 'Metadata', type: 'multiline', rows: 14, readonly: true }
          ],
        }
      ]
    };
  }
}

module.exports = StreamPlugin;
