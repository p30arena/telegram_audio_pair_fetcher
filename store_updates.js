const { Telegraf } = require('telegraf');
const fs = require('fs');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);

// Function to fetch and save updates
(async () => {
  let offset = 0;
  let allUpdates = [];
  while (true) {
    const updates = await bot.telegram.getUpdates(offset, 100, 0);
    if (updates.length === 0) {
      break;
    }
    allUpdates = allUpdates.concat(updates);
    offset = updates[updates.length - 1].update_id + 1;
  }

  console.log(`Fetched ${allUpdates.length} updates.`);

  // Save updates to a JSON file
  fs.writeFileSync('out/updates.json', JSON.stringify(allUpdates, null, 2));
  console.log('Updates saved to updates.json');
})();
