const WebSocket = require('ws');

const port = 9123;

const wss = new WebSocket.Server({ port });
const { readFile } = require("fs");
const crash = require("./crash.json");
const open = require('open');

let context = {
  "id": 1,
  "origin":"",
  "name":"node[4079]",
  "auxData": {
    "isDefault":true
  }
};

const crypto = require("crypto");

function generateUUID() {
  const uuid = crypto.randomBytes(16).toString("hex");
  return `${uuid.slice(0,8)}-${uuid.slice(8,12)}-${uuid.slice(12,16)}-${uuid.slice(16,20)}-${uuid.slice(20)}`;
}

const inspectorUUID = generateUUID();

function reportScripts(ws) {
  for (let scriptId in crash.Scripts) {
    const params = crash.Scripts[scriptId].params;
    const response = {
      "method":"Debugger.scriptParsed",
      "params": {
        "scriptId": scriptId,
        "url": params.url || `unknownScript/${scriptId}`,
        "startLine": params.startLine || 0,
        "startColumn": params.startColumn || 0,
        "endLine": params.endLine || ( () => { console.log("no end line"); return 0 } )(),
        "endColumn": params.endColumn || ( () => { console.log("no end column"); return 0 } )(),
        "executionContextId": context.id,
        "hash": params.hash || ( () => { console.log("no hash"); return 0 } )(),
        "executionContextAuxData": context.auxData,
        "isLiveEdit":false,
        "sourceMapURL":"",
        "hasSourceURL":false,
        "isModule": params.isModule || false,
        "length": params.length || ( () => { console.log("no length"); return 0 } )()
      }
    };
    ws.send(JSON.stringify(response));
  };
}


function reportPause(ws) {
  // console.log("report paused");
  ws.send(JSON.stringify({"method": "Debugger.paused", "params": crash.Paused[0] }));
}


// chrome-devtools://devtools/bundled/inspector.html?experiments=true&v8only=true&ws=127.0.0.1:9123/e72a508e-f4fa-41c0-bda0-2806f209aaa7
wss.on('connection', function connection(ws, request) {
  console.log(request.url)
  if (`${request.url}` != `/${inspectorUUID}`) {
    console.error(`Invalid UUID ${request.url}`);
    ws.terminate();
    return;
  }
  function handleMessage(id, method, params) {
    let result = {};
    switch (method) {
      case "Profiler.enable":
      case "Profiler.enable":
      case "Runtime.enable":
      case "HeapProfiler.enable":
      case "Debugger.setPauseOnExceptions":
      case "Debugger.setAsyncCallStackDepth":
      case "Runtime.runIfWaitingForDebugger":
      case "Debugger.setBlackboxPatterns":
        ws.send(JSON.stringify({id, result: {}}));
        break;
      case "Runtime.enable":
        ws.send(JSON.stringify({id, result: {}}));
        ws.send({"method":"Runtime.executionContextCreated","params":{ context }});
        break;
      case "Debugger.enable":
        ws.send(JSON.stringify({id, result: {"debuggerId":"(D68D8D086746457BD25486FC3493871B)"}}));
        reportScripts(ws);
        reportPause(ws);
        break;

      case "Runtime.getIsolateId":
        ws.send(JSON.stringify({id, result: {"id":"cdc24eb7a275c498"}}));
        break;
      case "Debugger.getScriptSource":
        const scriptId = params.scriptId || null;
        if (scriptId === null || !crash.Scripts[scriptId].source) {
          ws.send(JSON.stringify({id, result: { "scriptSource": "// script not found"}}));
          return;
        }
        ws.send(JSON.stringify({id, result: { "scriptSource": crash.Scripts[scriptId].source } }));
        break;
      case "Runtime.getProperties":
        const remoteObject = crash.RemoteObjects[params.objectId];
        if (!remoteObject) {
          console.error(`remote object not found: ${params.objectId}`);
          return;
        }
        ws.send(JSON.stringify({id, result: remoteObject }));
        // RemoteObjects
        break;
      default:
        console.error(`undefined method "${method}" with params "${JSON.stringify(params)}`);
        break;
    }
  }
  // console.log("connected");

  ws.on('message', function incoming(message) {
    // console.log('received: %s', message);

    const messageObj = JSON.parse(message);
    handleMessage(messageObj.id, messageObj.method, messageObj.params || {});
  });

  // ws.send('something');
});

const url = `chrome-devtools://devtools/bundled/inspector.html?experiments=true&v8only=true&ws=127.0.0.1:${port}/${inspectorUUID}`;

console.log(`Open ${url} on Google Chrome to start`)
