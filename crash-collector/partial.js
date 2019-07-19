'use strict'

const { Session } = require("inspector");
const session = new Session();
session.connect();

const crashContext = {
  "Paused": [],
  "RemoteObjects": {},
  "Scripts": {},
};

const parsedScripts = {};

function captureSource(scriptId) {
  if (crashContext.Scripts[scriptId] === undefined)
    session.post("Debugger.getScriptSource", { scriptId }, (err, { scriptSource }) => {
      crashContext.Scripts[scriptId] = {
        params: parsedScripts[scriptId] || {},
        source: scriptSource
      };
    });
}

function recursiveCaptureObjects(objectId, maxDepth) {
  if (maxDepth < 1) return;
  if (crashContext.RemoteObjects[objectId] === undefined) {
    session.post("Runtime.getProperties", { objectId, ownProperties: true }, (err, remoteObject) => {
      crashContext.RemoteObjects[objectId] = remoteObject;

      if (remoteObject.result) {
        for (let obj of remoteObject.result) {
          if (obj.value && obj.value.objectId) {
            recursiveCaptureObjects(obj.value.objectId, maxDepth - 1)
          }
        }
      }
    });
  }
}

function _captureCrashContext(params) {
  crashContext["Paused"].push(params);
  for (let frame of params.callFrames) {
    // Sources
    {
      if (frame.location)
        captureSource(frame.location.scriptId);
      if (frame.functionLocation)
        captureSource(frame.functionLocation.scriptId);
    }
    // `this`
    if (frame.this.objectId)
      // This can't be recursive, because RemoteObjectId is not unique. 2 makes
      // it flat (save this object and it's direct properties)
      recursiveCaptureObjects(frame.this.objectId, 2)
    // `this`
    if (frame.scopeChain)
      for (let scope of frame.scopeChain) {
        if (scope.location)
          captureSource(scope.location.scriptId);
        if (scope.object && scope.object.objectId)
          // This can't be recursive, because RemoteObjectId is not unique. 2
          // makes it flat (save this object and it's direct properties)
          recursiveCaptureObjects(scope.object.objectId, 2)
      }
  }
  return;
}

let trackingPromises = false;
let currentTracking = [];
let previousTracking = [];
let uncaughtException = null;
const handlePromiseRejections = process.execArgv.includes('--unhandled-rejections=strict');

session.on("Debugger.paused", ({ params }) => {
  if (params.reason == 'promiseRejection') {
    currentTracking.push(params);
    if (!trackingPromises) {
      trackingPromises = true;
      setTimeout(() => {
        trackingPromises = false;
        previousTracking = currentTracking;
        currentTracking = [];
        setTimeout(() => {
          previousTracking = [];
        }, 0);
      }, 0);
    }
    return;
  }

  if (params.reason != 'exception') return;

  uncaughtException = params;
  process.nextTick(() => { uncaughtException = null });
});

session.on("Debugger.scriptParsed", ({ params }) => {
  parsedScripts[params.scriptId] = params;
});

session.post("Debugger.enable", (err, result) => {
  session.post("Debugger.setPauseOnExceptions", { state: "uncaught"}, (err, result) => {
  });
});

function captureCrashContext(err) {
  if (uncaughtException)
    _captureCrashContext(uncaughtException);
  // We don't know what was
  if (currentTracking || previousTracking) {
    for (let possiblyUnhandledRejection of currentTracking.concat(previousTracking)) {
      _captureCrashContext(possiblyUnhandledRejection);
    }
  }

  let report = {};

  const timestamp = Math.floor(new Date());
  if (process.report) {
    report = process.report.getReport(err);
    if (typeof value === 'string' || value instanceof String)
      report = JSON.parse(report);
  } else {
    report = {
      processId: process.pid,
      dumpEventTimeStamp: timestamp,
      javascriptStack: {
        message: err.stack.substring(0, err.stack.indexOf("\n")),
      }
    };
  }
  crashContext.Report = report;

  return crashContext;
}

module.exports = {
  captureCrashContext
}
