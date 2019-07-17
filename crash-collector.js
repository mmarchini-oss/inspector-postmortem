'use strict';

const { Session } = require("inspector");
const session = new Session();
session.connect();

const { writeFileSync } = require("fs");

const crashContext = {
  "Paused": [],
  "RemoteObjects": {},
  "Scripts": {},
};

function captureSource(scriptId) {
  if (crashContext.Scripts[scriptId] === undefined)
    session.post("Debugger.getScriptSource", { scriptId }, (err, { scriptSource }) => {
      crashContext.Scripts[scriptId] = scriptSource;
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

function captureCrashContext(params) {
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
    console.log("frameDone")
  }
  console.log("captureDone")
  return;
}

let trackingPromises = false;
let currentTracking = [];
let previousTracking = [];
let possiblyUnhandledRejections = [];

let aaaa = session.on("Debugger.paused", ({ params }) => {
  console.log("paused");
  console.log(params.reason);
  if (params.reason == 'promiseRejection') {
    currentTracking.push(params);
    if (!trackingPromises) {
      trackingPromises = true;
      setTimeout(() => {
        trackingPromises = false;
        previousTracking = currentTracking;
        currentTracking = [];
        setTimeout(() => {
          console.log("hue");
          previousTracking = [];
        }, 0);
      }, 0);
    }
    return;
  }

  if (params.reason != 'exception') return;
  captureCrashContext(params);
});

session.post("Debugger.enable", (err, result) => {
  session.post("Debugger.setPauseOnExceptions", { state: "uncaught"}, (err, result) => {
  });
});

process.on("uncaughtException", (err) => {
  // We don't know what was
  if (currentTracking || previousTracking) {
    for (let possiblyUnhandledRejection of ( currentTracking )) {
      captureCrashContext(possiblyUnhandledRejection);
    }
    for (let possiblyUnhandledRejection of ( previousTracking )) {
      captureCrashContext(possiblyUnhandledRejection);
    }
  }
  writeFileSync("crash.json", JSON.stringify(crashContext));
  console.error(err);
  process.abort();
});
