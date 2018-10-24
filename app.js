const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const { URL } = require("url");
const puppeteer = require("puppeteer");
const archiver = require("archiver");
const fs = require("fs");
const rimraf = require("rimraf");
const path = require("path");
const slugify = require("slugify");

let browser;

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

app.post("/url", async function(request, response) {
  const url = request.body.url_field;
  const checkURL = new URL(url);
  if (checkURL.hostname !== "www.newamerica.org") {
    response.send("sorry, not a New America url");
    return;
  }
  browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  }); // { headless: false }
  const links = await scrapeToc(url);
  for (let i = 0; i < links.length; i++) {
    await downloadImages(links[i]);
  }

  const archive = archiver("zip");
  const output = fs.createWriteStream("./tmp/screenshots.zip");

  output.on("close", function(o) {
    console.log(archive.pointer() + " total bytes");
    console.log(
      "archiver has been finalized and the output file descriptor has closed."
    );
    response.sendFile(path.join(__dirname, "/tmp/screenshots.zip"));
    rimraf("./tmp/*", err => console.log(err));
  });

  archive.pipe(output);
  archive.glob("./tmp/*.png"); //some glob pattern here
  // add as many as you like
  archive.on("error", function(err) {
    throw err;
  });
  archive.finalize();
});

async function scrapeToc(url) {
  const page = await browser.newPage();
  await page.setViewport({
    width: 1400,
    height: 1200
  });
  await page.goto(url, {
    waitUntil: "networkidle2"
  });
  const links = await page.evaluate(() => {
    const links = Array.from(
      document.querySelectorAll("#contents [data-value=click_menu_section]")
    );
    return links.map(link => link.href);
  });
  await page.close();
  return links.length > 0 ? links : [url];
}

async function downloadImages(url) {
  const page = await browser.newPage();
  await page.goto(url, {
    waitUntil: "networkidle2"
  });
  const blocks = await page.$$(".block-dataviz");
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
  for (let i = 0; i < blocks.length; i++) {
    const fileName = Date.now();
    await screenshotDOMElement({
      path: `./tmp/${fileName}.png`,
      el: blocks[i],
      padding: 16,
      page: page
    });
  }
  await page.close();
}

async function screenshotDOMElement(opts = {}) {
  const page = opts.page;
  const padding = "padding" in opts ? opts.padding : 0;
  const path = "path" in opts ? opts.path : null;
  const element = opts.el;

  const rect = await page.evaluate(element => {
    if (!element) return null;
    const { x, y, width, height } = element.getBoundingClientRect();
    return { left: x, top: y, width, height, id: element.id };
  }, element);

  if (!rect)
    throw Error(`Could not find element that matches element: ${element}.`);

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
