'use strict'

var path = require('path');

const express = require('express');
const nunjucks = require('nunjucks')
const puppeteer = require('puppeteer');
const browserFetcher = puppeteer.createBrowserFetcher();

const { getCrashes } = require('./inspector-ws.js');

const app = express();
const port = 3000;
nunjucks.configure(path.join(__dirname, 'views'), {
    autoescape: true,
    express: app,
    watch: true
});

app.get('/', (req, res) => res.render("index.html", { crashes: getCrashes() }));

async function main() {
  const localRevisions = await browserFetcher.localRevisions();
  const { folderPath } = await browserFetcher.download(localRevisions[0]);
  app.use('/inspector', express.static(path.join(folderPath, 'chrome-linux', 'resources', 'inspector')));
  console.log(path.join(folderPath, 'resources', 'inspector'));

  app.listen(port, () => console.log(`Example app listening on port ${port}!`))
}

main();
