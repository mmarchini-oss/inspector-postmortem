'use strict';

const { writeFileSync } = require("fs");
const { captureCrashContext } = require("./partial.js");

process.on("uncaughtException", (err) => {
  const crashContext = captureCrashContext(err);

  const timestamp = Math.floor(new Date() / 1000);
  writeFileSync(`crash.${timestamp}.${process.pid}.json`, JSON.stringify(crashContext));
  console.error(err);
  process.exit(1);
});
