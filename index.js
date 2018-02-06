const fs = require("fs");
const http = require("http");
const util = require("util");
const { execFile } = require("child_process");
const { resolve, dirname, join } = require("path");

const unzip = require("unzip-stream");
const archiver = require("archiver");
const WebSocket = require("ws");
const serverPath = dirname(resolve(process.argv[2]));

const stat = util.promisify(fs.stat);
const unlink = util.promisify(fs.unlink);
const readdir = util.promisify(fs.readdir);
const rmdir = util.promisify(fs.rmdir);

const noop = err => {if(err) console.error(err);};

try{
  fs.mkdirSync(join(serverPath, "backups"));
}catch(e){
  if(e.code !== "EEXIST"){//if the dir already exists than everything is fine, otherwise we might not have permissions to add a dir
    throw e;
  }
}

let auth = [];

try{
  auth = require("./auth.json");
}catch(e){
  if(e.code === "ENOENT"){
    fs.writeFileSync("auth.json", {});
  }else{
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
let loadTime = "";
let state = 0;//0 = loading, 1 = ready, 2 = shutting down
let numPlayers = 0;
let playersOnline = 0;

let lines = [];
let backups = [];
let port;
let restoring = false;
let restore = () => {};

const onLine = (regex, callback, delAfterFirstCall) => {
  lines.push([regex, callback, delAfterFirstCall]);
};


const html = fs.readFileSync("public/index.html");
const httpServer = http.createServer(function (request, response) {
    response.writeHeader(200, { "Content-Type": "text/html" });
    response.write(html);
    response.end();
});

const wss = new WebSocket.Server({server: httpServer});

httpServer.listen(8081);
// httpServer.on('upgrade', wss.handleUpgrade);


wss.on("connection", function connection(ws) {
  ws.on("message", function incoming(message) {
    try{
      const data = JSON.parse(message);
      console.log("got", message);
      let correctAuth = false;
      const obj = {};

      if(data.auth){
        correctAuth = auth.some(user => {
          if(user.username === data.auth.username && user.password === data.auth.password){
            return true;
          }
        });
        obj.correctAuth = correctAuth;
      }
      console.log("correctAuth", correctAuth);
      Object.entries(data).forEach(([key, value]) => {
        switch (key){
          case "restoreBackup":
            if(!correctAuth) break;
            restoring = true;
            console.log("RESTORE", value);
            stop();
            restore = () => {
              restoreBackup(value).then(() => {
                restoring = false;
                start();
              });
            };
          break;
          case "deleteBackup":
            rmBackup(value).then(() => send({backups}));
          break;
          case "auth":break;
          default:
            console.error("unknown key", key, "in ws message");
        }
      });
      ws.send(JSON.stringify(obj));
    }catch(e){
      console.error(e, message);
      ws.send(JSON.stringify({"error": e.toString()}));
    }
  });

  if(state === 1){
    send({loadTime});
  }

  send({backups});

  if(port){
    send({port});
  }

  ws.on("error", () => console.log("rip connection"));//why the heck https://github.com/websockets/ws/issues/1256

  setState(state);
});

const send = (obj, options, callback = () => {}) => {
    //console.log("sending", JSON.stringify(str).slice(0, 500));
    wss.clients.forEach(c => {
      if (c.isAlive === false) return c.terminate();
        c.send(JSON.stringify(obj), options, err => err && console.error("SWALLOWED", err));
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
    if(restoring){
      restore();
    }else{
      if(signal !== "SIGTERM" && signal !== "SIGINT" && signal !== "SIGBREAK" && code !== 130){
        console.log("restarting due to crash");
        send({crash: {code, signal}}, {}, start);
      }else{
        console.log("closing due to user termination");
        send({exit: {code, signal}}, {}, () => wss.close(process.exit));
      }
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

onLine(/Starting Minecraft server on .*:(\d+)/i, (_, parsedPort) => {
  port = parseInt(parsedPort);
  send({port});
});

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

const rmBackup = async function(fileName){
  const dir = join(serverPath, "backups", fileName);
  console.log("rm -rf ", dir);
  const unlinkPromise = file => new Promise((resolve, reject) => {
    fs.unlink(file, err => {
      if(err) return console.error(err);
      resolve("success");
    });
  });
  let promises = [];
  const files = await readdir(dir);
  files.forEach(file => promises.push(unlinkPromise(join(dir, file))));
  try{
    const res = await Promise.all(promises);
    console.log("res", res);
    await rmdir(dir);
  }catch(e){}
};


const rmRf = async function(dir){
  const files = await readdir(resolve(dir));
  for(let i = 0; i < files.length; i ++){
    const file = await stat(resolve(join(dir, files[i])));
    if(file.isDirectory()){
      await rmRf(resolve(join(dir, files[i])));
    }else{
      await unlink(resolve(join(dir, files[i])));
    }
  }
  await rmdir(resolve(dir));
};

const unzipPromise = (backup, fileName) => new Promise((resolve, reject) => {
  console.log("extracting", join(serverPath, "backups", backup, fileName + ".zip"), "to", join(serverPath, fileName));
  fs.createReadStream(
    join(serverPath, "backups", backup, fileName + ".zip")
  ).pipe(
    unzip.Extract({path: join(serverPath, fileName)})
  ).on("close", resolve);
});

const restoreBackup = async function(backup){
  const names = ["world", "world_nether", "world_the_end"];
  for(const name of names){
    console.log("rm -rf " + join(serverPath, name));
    await rmRf(join(serverPath, name));
    await unzipPromise(backup, name);
  }
};

setTimeout(() => {
  backup();
  setInterval(backup, 1000 * 60 * 5);//every 5 minutes
}, 1000);

setInterval(() => send({backups: backups.filter(Boolean)}), 1000 * 20);

process.on("SIGTERM", stop);
process.on("SIGINT", stop);
process.on("SIGBREAK", stop);
