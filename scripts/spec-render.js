const { exec } = require('child_process');

setTimeout(()=>{
  console.log('Cleaning up after spec-up... 🧹🧹🧹🧹🧹');
  const cmd = `kill -9 $(ps -A | grep "./spec-up/start.js" | head -n1 | awk '{print $1;}')`;
  exec(cmd, () => {
    process.exit(0);
  });
}, 5 * 1000)

require('spec-up')({
  nowatch: true,
  renderOnInstall: true
});