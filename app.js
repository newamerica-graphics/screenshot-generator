const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const { URL } = require("url");
const puppeteer = require("puppeteer");
const archiver = require("archiver");
const fs = require("fs");
const EventEmitter = require("events");
const path = require("path");
const rimraf = require("rimraf");
const slugify = require("slugify");

let browser;
let page;

const Status = new EventEmitter();

app.set("port", process.env.PORT || 5000);
app.use(express.static(__dirname + "/public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.listen(app.get("port"), function() {
  console.log("Node app is running at localhost:" + app.get("port"));
});

app.get("/", function(request, response) {
  response.send("Hello World!");
});

app.get("/status", function(request, response) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });
  Status.on("start", () => {
    response.write("data: start\n\n");
  });
  Status.on("end", () => {
    response.write("data: end\n\n");
  });
});

app.post("/url", async function(request, response) {
  const url = request.body.url_field;
  const checkURL = new URL(url);
  if (checkURL.hostname !== "www.newamerica.org") {
    response.send("sorry, not a New America url");
    return;
  }

  Status.emit("start");

  browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    headless: true
  });
  page = await browser.newPage();
  await page.setViewport({
    width: 1200,
    height: 1200,
    deviceScaleFactor: 3
  });

  const links = await scrapeToc(url);
  for (let i = 0; i < links.length; i++) {
    await downloadImages(links[i]);
  }

  const archive = archiver("zip");
  const output = fs.createWriteStream("./screenshots/screenshots.zip");

  output.on("close", function(o) {
    console.log(
      "archiver has been finalized and the output file descriptor has closed."
    );
    Status.emit("end");
    response.download(path.join(__dirname, "/screenshots/screenshots.zip"));
    rimraf("./screenshots/*", err => (err ? console.log(err) : null));
  });

  archive.pipe(output);
  archive.glob("./screenshots/*.png");
  archive.on("error", function(err) {
    throw err;
  });
  archive.finalize();
});

async function scrapeToc(url) {
  await page.goto(url, {
    waitUntil: ["networkidle0", "networkidle2", "domcontentloaded"]
  });
  const links = await page.evaluate(() => {
    const links = Array.from(
      document.querySelectorAll("#contents [data-value=click_menu_section]")
    );
    return links.map(link => link.href);
  });
  // await page.close();
  return links.length > 0 ? links : [url];
}

async function downloadImages(url) {
  await page.goto(url, {
    waitUntil: ["networkidle0", "networkidle2", "domcontentloaded"]
  });
  await page.waitFor(2000);
  await page.evaluate(() => {
    const cookieNotification = document.querySelector(".cookies-notification");
    if (cookieNotification) {
      cookieNotification.style.display = "none";
    }
    const bottomNav = document.querySelector(".report__bottom-nav-bar");
    if (bottomNav) {
      bottomNav.style.display = "none";
    }
    const topNav = document.querySelector(".report__top-nav");
    if (topNav) {
      topNav.style.display = "none";
    }
  });
  const blocks = await page.$$(".na-dataviz");
  for (let i = 0; i < blocks.length; i++) {
    await screenshotDOMElement({
      el: blocks[i],
      padding: 16,
      page: page
    });
  }
}

async function screenshotDOMElement(opts = {}) {
  const page = opts.page;
  const padding = "padding" in opts ? opts.padding : 0;
  const element = opts.el;

  const rect = await page.evaluate(element => {
    if (!element) return null;
    const { x, y, width, height } = element.getBoundingClientRect();
    return { left: x, top: y, width, height, id: element.id };
  }, element);

  if (!rect)
    throw Error(`Could not find element that matches element: ${element}.`);

  const path = `./screenshots/${rect.id}.png`;

  return await page.screenshot({
    path,
    clip: {
      x: rect.left - padding,
      y: rect.top - padding,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2
    }
  });
}
