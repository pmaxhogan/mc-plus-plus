const fs = require("fs");
const archiver = require("archiver");
const { execFile } = require("child_process");
const { resolve, dirname, join } = require("path");
const WebSocket = require("ws");
const serverPath = dirname(resolve(process.argv[2]));

const noop = err => {if(err) console.error(err);};

try{
  fs.mkdirSync(join(serverPath, "backups"));
}catch(e){
  if(e.code !== "EEXIST"){//if the dir already exists than everything is fine, otherwise we might not have permissions to add a dir
    throw e;
  }
}

const javaArgs = "-Xms1G -Xmx1G -XX:+UseG1GC -XX:+UnlockExperimentalVMOptions -XX:MaxGCPauseMillis=50 -XX:+DisableExplicitGC -XX:TargetSurvivorRatio=90 -XX:G1NewSizePercent=50 -XX:G1MaxNewSizePercent=80 -XX:InitiatingHeapOccupancyPercent=10 -XX:G1MixedGCLiveThresholdPercent=50 -XX:+AggressiveOpts -DIReallyKnowWhatIAmDoingISwear -server -jar";//a crapton of jvm args. i hope they're useful!
//https://www.spigotmc.org/threads/guide-optimizing-spigot-remove-lag-fix-tps-improve-performance.21726/page-10#post-1055873

(() => {
  let oldLog = console.log;
  console.log = (...args) => oldLog("MC++: ", ...args);
})();

const zipFolder = (folderName, dest) => new Promise((resolve, reject) => {
  // create a file to stream archive data to.
  var output = fs.createWriteStream(dest);
  var archive = archiver("zip", {
    zlib: { level: 9 } // Sets the compression level.
  });

  // listen for all archive data to be written
  // "close" event is fired only when a file descriptor is involved
  output.on("close", function() {
    console.log("file size of archive", folderName, "is", archive.pointer() + " total bytes");
    resolve();
  });
  // good practice to catch warnings (ie stat failures and other non-blocking errors)
  archive.on("warning", function(err) {
    // throw error
    reject(err);
  });
  archive.on("error", function(err) {
    reject(err);
  });
  archive.pipe(output);
  archive.directory(folderName, false);
  archive.finalize();
});

const wss = new WebSocket.Server({ port: 8081 });

let loadTime = "";
let state = 0;//0 = loading, 1 = ready, 2 = shutting down
let numPlayers = 0;
let playersOnline = 0;

let lines = [];
let backups = [];

const onLine = (regex, callback, delAfterFirstCall) => {
  lines.push([regex, callback, delAfterFirstCall]);
};

wss.on("connection", function connection(ws) {
  ws.on("message", function incoming(message) {
    console.log("received: %s", message);
  });

  if(state === 1){
    ws.send({loadTime});
  }

  ws.send({backups});

  ws.on("error", () => console.log("rip connection"));//why the heck https://github.com/websockets/ws/issues/1256

  setState(state);
});

const send = (str, options, callback = () => {}) => {
    console.log("clients");
    console.log("sending", JSON.stringify(str).slice(0, 500));
    wss.clients.forEach(c => {
      if (c.isAlive === false) return c.terminate();
        c.send(JSON.stringify(str), options, err => err && console.error("SWALLOWED", err));
    });
    callback();
};

const setState = newState => {
  state = newState;
  send({newState: state});
};

const updateBackups = () => new Promise((resolve, reject) => {
  fs.readdir(join(serverPath, "backups"), (err, folders) => {
    if(err) return reject(err);
    backups = folders;
    send({backups});
    resolve();
  });
});

updateBackups();

console.log("Path to server: ", resolve(process.argv[2]));

let lastLine = "";

let server;

const numPlayersOnline = 0;

const start = () => {
  setState(0);
  server = execFile("java", [...javaArgs.split(" "), resolve(process.argv[2])], {
    cwd: serverPath
  });


  server.stderr.on("data", data=>{
    process.stdout.write("ERR: " + data);
  });
  server.stdout.on("data", data=>{
    if(data.includes("\n")){
      data = lastLine + data;
      data.split("\n").slice(0, -1).map(x=>x.trim()).forEach(procLine);
      lastLine = data.split("\n").slice(-1)[0];
    }else{
      lastLine += data;
    }
  });
  server.stdout.pipe(process.stdout);
  process.stdin.pipe(server.stdin);


  server.on("exit", (code, signal) => {
    console.log("The server has stopped.", code, signal);
    if(signal !== "SIGTERM" && signal !== "SIGINT" && signal !== "SIGBREAK" && code !== 130){
      console.log("restarting due to crash");
      send({crash: {code, signal}}, {}, start);
    }else{
      console.log("closing due to user termination");
      send({exit: {code, signal}}, {}, () => wss.close(process.exit));
    }
  });
};

start();

const procLine = line => {
  const started = line.match(/Done \((.*?)\)! For help, type "help" or "\?"/);
  if(started){
    setState(1);
    send({loadTime: started[1]});
    loadTime = started[1];
  }
  lines = lines.filter(Boolean);
  lines.forEach((lineToCompare, idx) => {
    if(!lineToCompare) return;
    const match = line.match(lineToCompare[0]);
    if(match){
      lineToCompare[1](...match);
      if(lineToCompare[2]){
        lines[idx] = undefined;
      }
    }
  });
};


const stop = () => {
  console.log("Shutting down...");
  switch (state) {
    case 0:
      server.kill("SIGINT");
    break;
    case 1:
      server.stdin.write("restart\n");
    break;
    case 2:
      console.log("Looks like you're trying to stop the process while it is already stopping. Please wait a bit.");
      server.stdin.write("restart\n");
    break;
  }
  setState(2);
};

const backup = () => {
  if(state !== 1) return;
  server.stdin.write("save-all\n");
  onLine(/Saved the world$/ig, () => {
    server.stdin.write("save-off\n");
    onLine(/(Turned off world auto-saving|Saving is already turned off)$/ig, () => {
      const timestamp = (new Date()).toISOString().replace(/:/g, "_");


      fs.mkdir(join(serverPath, "backups", timestamp), err => {
        if(err && err.code === "EEXIST") return;
        if(err) return console.error(err);

        zipFolder(join(serverPath, "world"), join(serverPath, "backups", timestamp, "world.zip")).then(() =>

        zipFolder(join(serverPath, "world_nether"), join(serverPath, "backups", timestamp, "world_nether.zip")).then(() =>

        zipFolder(join(serverPath, "world_the_end"), join(serverPath, "backups", timestamp, "world_the_end.zip")).then(() => {
          server.stdin.write("save-on\n");
          updateBackups().then(checkBackupDupes);
        }))).catch(console.error);//let's go promises!
      });
    }, true);
  }, true);
};

const checkBackupDupes = () => {
  const now = new Date();
  const timeStamps = backups;

  timeStamps.reduce((arr, fileName, idx) => {
    if(!fileName) return arr;
    const timeStamp = new Date(fileName.replace(/_/g, ":"));
    if(arr){

      const elapsedTime = now.getTime() - timeStamp.getTime();

      timeStamps.forEach((other, idx2) => {
        if(!other || idx === idx2) return;
        otherDate = new Date(other.replace(/_/g, ":"));
        //if(otherDate.getTime() > timeStamp.getTime()) return;
        let deleteIt = false;
        if(elapsedTime < 1000 * 60 * 60 * 24){
          if(Math.abs(otherDate.getTime() - timeStamp.getTime()) < 1000 * 60 * 60){//if the backup is less than a day old (w/ 10s buffer) and has a dupe in the same hour
            deleteIt = true;
          }
        }else if(Math.abs(otherDate.getTime() - timeStamp.getTime()) < 1000 * 60 * 60* 24){//if the backup has a dupe in the same day
          deleteIt = true;
        }
        if(deleteIt){
          rmBackup(other);
          timeStamps[idx2] = undefined;
        }
      });
    }
    arr.push(timeStamp);
    return arr;
  }, []);
};

const rmBackup = fileName => {
  const dir = join(serverPath, "backups", fileName);
  console.log("rm -rf ", dir);
  const unlinkPromise = file => new Promise((resolve, reject) => {
    fs.unlink(file, err => {
      if(err) return console.error(err);
      resolve("success");
    });
  });
  let promises = [];
  fs.readdir(dir, (err, files) => {
    files.forEach(file => promises.push(unlinkPromise(join(dir, file))));
    Promise.all(promises).then(res => {
      console.log("res", res);
      fs.rmdir(dir, noop);
    }).catch(() => {});
  });
};

setTimeout(() => {
  backup();
  setInterval(backup, 1000 * 30);//every minute
}, 1000);

setInterval(() => send({backups: backups.filter(Boolean)}), 1000 * 20);

process.on("SIGTERM", stop);
process.on("SIGINT", stop);
process.on("SIGBREAK", stop);
