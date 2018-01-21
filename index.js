const { execFile } = require("child_process");
const { resolve, dirname, join } = require("path");
const WebSocket = require("ws");
const ncp = require("ncp").ncp;
const serverPath = dirname(resolve(process.argv[2]));

ncp.limit = 16;

const javaArgs = "-Xms1G -Xmx1G -XX:+UseConcMarkSweepGC -DIReallyKnowWhatIAmDoingISwear -server -jar";


(() => {
  let oldLog = console.log;
  console.log = (...args) => oldLog("MC++: ", ...args);
})();

const wss = new WebSocket.Server({ port: 8081 });

let loadTime = "";
let state = 0;//0 = loading, 1 = ready, 2 = shutting down
let numPlayers = 0;
let playersOnline = 0;

let lines = [];

const onLine = (regex, callback) => {
  lines.push([regex, callback]);
};

wss.on("connection", function connection(ws) {
  ws.on("message", function incoming(message) {
    console.log("received: %s", message);
  });

  if(state === 1){
    ws.send({loadTime});
  }

  ws.on("error", () => console.log("bye connection"));//why the heck https://github.com/websockets/ws/issues/1256

  setState(state);
});

const send = (str, options, callback = () => {}) => {
    console.log("clients");
    console.log("sending", JSON.stringify(str));
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
    send({loadTime: match[1]});
    loadTime = match[1];
  }

  lines.forEach(lineToCompare => {
    const match = line.match(lineToCompare[0]);
    if(match){
      lineToCompare[1](...match);
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

setTimeout(() =>
setInterval(() => {
  if(state !== 1) return;
  server.stdin.write("save-all\n");
  onLine(/Saved the world$/ig, () => {
    server.stdin.write("save-off\n");
    onLine(/Turned off world auto-saving$/ig, () => {
      const timestamp = (new Date()).toISOString();

      fs.mkdir(join(serverPath, "backups", timestamp), err => {
        if(err) return console.error(err);

        ncp(join(serverPath, "world"), join(serverPath, "backups", timestamp, "world"), err => {
          if(err) return console.error(err);

          ncp(join(serverPath, "world_nether"), join(serverPath, "backups", timestamp, "world_nether"), err => {
            if(err) return console.error(err);

            ncp(join(serverPath, "world_the_end"), join(serverPath, "backups", timestamp, "world_the_end"), err => {
              if(err) return console.error(err);

              server.stdin.write("save-on\n");
              send({});
            });
          });
        });
      });
    });
  });
}, 5000), 1000);

process.on("SIGTERM", stop);
process.on("SIGINT", stop);
process.on("SIGBREAK", stop);
