'use strict'

const crypto = require("crypto");

const WebSocket = require('ws');

const port = 9123;

const wss = new WebSocket.Server({ port });
const fs = require("fs");


function generateUUID() {
  const uuid = crypto.randomBytes(16).toString("hex");
  return `${uuid.slice(0,8)}-${uuid.slice(8,12)}-${uuid.slice(12,16)}-${uuid.slice(16,20)}-${uuid.slice(20)}`;
}

const crashes = {};
const loadedFiles = {};

setInterval(() => {
  fs.readdir("./", function(err, items) {
    console.log("Loading files");
    for (let item of items) {
      if (item in loadedFiles) continue;
      if (item.startsWith("crash.") && item.endsWith(".json")) {
        const uuid = generateUUID();
        crashes[uuid] = require(`../${item}`);
        loadedFiles[item] = uuid;
      }
    }
    // Ideally we should remove stray files, but this is good enough for now
    console.log("Files loaded");
  });
}, 5000);

const connections = [];


class InspectorConnection {
  constructor(ws, inspectorUUID) {
    if (!(inspectorUUID in crashes)) {
      this.valid = false;
      console.error(`Invalid UUID ${inspectorUUID}`);
      ws.terminate();
      return;
    }
    this.valid = true;
    this._ws = ws;

    this._ws.on('message', (message) => {
      const messageObj = JSON.parse(message);
      this.handleMessage(messageObj.id, messageObj.method, messageObj.params || {});
    });

    this.crash = crashes[inspectorUUID];
    this.context = {
      "id": 1,
      "origin":"",
      "name":`node[${this.crash.Report.processId}](crashed)`,
      "auxData": {
        "isDefault":true
      }
    };
  }

  handleMessage = (id, method, params) => {
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
        this._ws.send(JSON.stringify({id, result: {}}));
        break;
      case "Runtime.enable":
        this._ws.send(JSON.stringify({id, result: {}}));
        this._ws.send({"method":"Runtime.executionContextCreated","params":{ context: this.context }});
        break;
      case "Debugger.enable":
        this._ws.send(JSON.stringify({id, result: {"debuggerId":"(D68D8D086746457BD25486FC3493871B)"}}));
        this.reportScripts();
        this.reportPause();
        break;

      case "Runtime.getIsolateId":
        this._ws.send(JSON.stringify({id, result: {"id":"cdc24eb7a275c498"}}));
        break;
      case "Debugger.getScriptSource":
        const scriptId = params.scriptId || null;
        if (scriptId === null || !this.crash.Scripts[scriptId].source) {
          this._ws.send(JSON.stringify({id, result: { "scriptSource": "// script not found"}}));
          return;
        }
        this._ws.send(JSON.stringify({id, result: { "scriptSource": this.crash.Scripts[scriptId].source } }));
        break;
      case "Runtime.getProperties":
        const remoteObject = this.crash.RemoteObjects[params.objectId];
        if (!remoteObject) {
          this._ws.send(JSON.stringify({
            "method": "Log.entryAdded",
            "params": { source: "other", level: "warning", text: "Tried to access properties of an object that was not saved during crash capture" }
          }));
          console.error(`remote object not found: ${params.objectId}`);
          return;
        }
        this._ws.send(JSON.stringify({id, result: remoteObject }));
        // RemoteObjects
        break;
      default:
        console.error(`undefined method "${method}" with params "${JSON.stringify(params)}`);
        break;
    }
  }

  reportScripts = () => {
    for (let scriptId in this.crash.Scripts) {
      const params = this.crash.Scripts[scriptId].params;
      const response = {
        "method":"Debugger.scriptParsed",
        "params": {
          "scriptId": scriptId,
          "url": params.url || `unknownScript/${scriptId}`,
          "startLine": params.startLine || 0,
          "startColumn": params.startColumn || 0,
          "endLine": params.endLine || ( () => { console.log("no end line"); return 0 } )(),
          "endColumn": params.endColumn || ( () => { console.log("no end column"); return 0 } )(),
          "executionContextId": this.context.id,
          "hash": params.hash || ( () => { console.log("no hash"); return 0 } )(),
          "executionContextAuxData": this.context.auxData,
          "isLiveEdit":false,
          "sourceMapURL":"",
          "hasSourceURL":false,
          "isModule": params.isModule || false,
          "length": params.length || ( () => { console.log("no length"); return 0 } )()
        }
      };
      this._ws.send(JSON.stringify(response));
    };
  }

  reportPause = (ws) => {
    this._ws.send(JSON.stringify({"method": "Debugger.paused", "params": this.crash.Paused[0] }));
  }

}


// chrome-devtools://devtools/bundled/inspector.html?experiments=true&v8only=true&ws=127.0.0.1:9123/e72a508e-f4fa-41c0-bda0-2806f209aaa7
wss.on('connection', function connection(ws, request) {
  const connection = new InspectorConnection(ws, request.url.substring(1));
  if (connection.valid)
    connections.push(connection)
});

function getCrashes() {
  const result = [];
  for (let file in loadedFiles) {
    const uuid = loadedFiles[file];
    const crash = crashes[uuid]
    if (!crash || !crash.Report) continue;
    const url = `/inspector/inspector.html?experiments=true&v8only=true&ws=127.0.0.1:${port}/${uuid}`;
    const pid = crash.Report.processId;
    const timestamp = new Date(crash.Report.dumpEventTimeStamp);
    const errorMessage = crash.Report.javascriptStack.message

    result.push({ uuid, url, pid, timestamp, errorMessage });
  }
  return result;
}

module.exports = {
  getCrashes,
}
