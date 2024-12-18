const { Telegraf } = require("telegraf");
const fs = require("fs");
const path = require("path");
const { HttpsProxyAgent } = require("https-proxy-agent");
require("dotenv").config();

const bot = new Telegraf(process.env.BOT_TOKEN, {
  telegram: process.env.https_proxy
    ? {
        agent: new HttpsProxyAgent(process.env.https_proxy),
      }
    : undefined,
});
const updatesFile = path.join("./out/", "updates.json");

// Function to fetch and save updates
(async () => {
  let offset = 0;
  let allUpdates = [];
  while (true) {
    const updates = await bot.telegram.getUpdates(0, 100, offset);
    if (updates.length === 0) {
      break;
    }
    allUpdates = allUpdates.concat(updates);
    offset = updates[updates.length - 1].update_id + 1;
  }

  console.log(`Fetched ${allUpdates.length} updates.`);

  if (!allUpdates.length) return;

  try {
    fs.accessSync(updatesFile, fs.constants.R_OK);

    const prev = JSON.parse(
      fs.readFileSync(updatesFile, { encoding: "utf-8" }).toString()
    );
    allUpdates = [...prev, ...allUpdates];
  } catch (e) {}

  // Save updates to a JSON file
  fs.writeFileSync(updatesFile, JSON.stringify(allUpdates, null, 2), {
    encoding: "utf-8",
  });
  console.log("Updates saved to updates.json");
})();
