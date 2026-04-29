const kill = require('tree-kill');
const { spawn } = require('child_process');

class Blackout {
  constructor(engine) {
    this.engine = engine;
    this.mpvProcess = null;
  }

 
  _showBlackout(extraArgs = []) {
   
    console.log(`[Blackout] Blackout activating`);
    if (this.mpvProcess) return;
    this.mpvProcess = spawn('mpv', [
      '--force-window=yes',
      '--fullscreen',
      '--ontop',
      '--background-color=#000000',
      '--idle=yes',
      '--keep-open=yes',
      '--no-osc',
      '--ontop',
      '--no-osd-bar',
      '--title=STAGE-BLACKOUT',
      ...extraArgs
    ]);


    this.mpvProcess.stderr.on('data', (data) => {
        console.error(`[MPV ${this.id}]: ${data.toString()}`);
    });

    this.mpvProcess.stdout.on('data', (data) => {
      console.info(`[MPV ${this.id}]: ${data.toString()}`);
    });

    this.mpvProcess.on('close', (code) => {
        console.warn(`[Blackout] MPV closed (Exit Code: ${code})`);
        this.mpvProcess = null;
        this.engine.toggleFullscreen(false, this.engine.fullscreenNum);
    });
  }

  _hideBlackout() {
    if (this.mpvProcess) {
      kill(this.mpvProcess.pid, 'SIGTERM', (err) => {
        if (err) console.error(`Error stopping blackout process:`, err);
      });
      this.mpvProcess = null;
    }
  }
}


module.exports = Blackout;