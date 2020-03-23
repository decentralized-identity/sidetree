const { exec } = require("child_process");
require('spec-up')();

setTimeout(()=>{
    exec('killall node')
}, 5 * 1000)