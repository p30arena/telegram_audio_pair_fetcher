const { Telegraf } = require('telegraf');
const fs = require('fs');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const updates_file = 'out/updates.json';

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

  if(!allUpdates.length) return;

  if(fs.existsSync(updates_file)) {
    const prev = JSON.parse(fs.readFileSync(updates_file).toString());
    allUpdates = [...prev, ...allUpdates];
  }

  // Save updates to a JSON file
  fs.writeFileSync(updates_file, JSON.stringify(allUpdates, null, 2));
  console.log('Updates saved to updates.json');
})();
