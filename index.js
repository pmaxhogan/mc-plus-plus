const { execFile } = require("child_process");
const { resolve, dirname } = require("path");
const WebSocket = require("ws");

const wss = new WebSocket.Server({ port: 8081 });

let clients = [];

let loadTime = "";
let state = 0;//0 = loading, 1 = ready, 2 = shutting down

wss.on("connection", function connection(ws) {
  ws.on("message", function incoming(message) {
    console.log("received: %s", message);
  });

  if(state === 1){
    ws.send({loadTime});
  }

  ws.on("error", () => console.log("bye connection"));//why the heck https://github.com/websockets/ws/issues/1256

  clients.push(ws);

  setState(state);
});

const send = (str, options, callback) => {
  if(clients.length){
    clients.forEach(c => c.send(JSON.stringify(str), options, callback));
  }else if(callback){
    callback();
  }
};

const setState = newState => {
  send({newState: state});
  state = newState;
};

console.log("Path to server: ", resolve(process.argv[2]));

let lastLine = "";

let server;

const start = () => {
  setState(0);
  server = execFile("java", ["-Xms1G", "-Xmx1G", "-XX:+UseConcMarkSweepGC", "-DIReallyKnowWhatIAmDoingISwear", "-jar", resolve(process.argv[2])], {
    cwd: dirname(resolve(process.argv[2]))
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
      send({exit: {code, signal}}, {}, process.exit);
    }
  });
};

start();

const procLine = line => {
  const match = line.match(/Done \((.*?)\)! For help, type "help" or "\?"/);
  if(match){
    setState(1);
    send({loadTime: match[1]});
    loadTime = match[1];
  }
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
    break;
  }
  setState(2);

};

process.on("SIGTERM", stop);
process.on("SIGINT", stop);
process.on("SIGBREAK", stop);
