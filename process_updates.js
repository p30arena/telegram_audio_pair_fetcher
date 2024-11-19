const { Telegraf } = require("telegraf");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const bot = new Telegraf(process.env.BOT_TOKEN);

// Replace with your group chat ID (e.g., -123456789)
const groupChatId = Number(process.env.GROUP_CHAT_ID);

const downloadDir = path.join("./out/", "downloads");
const outputFile = path.join("./out/", "result_list.json");
const updatesFile = path.join("./out/", "updates.json");
if (!fs.existsSync(downloadDir)) {
  fs.mkdirSync(downloadDir);
}

// The list to maintain the data
const associations = {};

// Function to download the audio file
async function downloadFile(fileId, fileUniqueId, mimeType) {
  const file = await bot.telegram.getFile(fileId);
  const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
  const fileExtension = mimeType && mimeType.includes("ogg") ? ".ogg" : ".mp3";
  const fileName = path.join(
    downloadDir,
    `${fileUniqueId}_${Date.now()}${fileExtension}`
  );

  const response = await axios({
    url: fileUrl,
    method: "GET",
    responseType: "stream",
  });

  const writer = fs.createWriteStream(fileName);

  response.data.pipe(writer);

  await new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });

  return fileName;
}

// Function to save the resultList to a JSON file
function saveResultList(results) {
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
  console.log(`Result list saved to ${outputFile}`);
}

// Main function to process updates from updates.json
(async () => {
  // Load updates from the JSON file
  const allUpdates = JSON.parse(
    fs.readFileSync(updatesFile, { encoding: "utf-8" }).toString()
  );

  console.log(`Processing ${allUpdates.length} updates.`);

  let idx = 0;
  // Process the updates
  for (const update of allUpdates) {
    if (!update.message) continue;

    const message = update.message;

    if (!message.chat || message.chat.id !== groupChatId) continue;

    if (message.text) {
      // Handle text messages
      if (
        message.reply_to_message &&
        (message.reply_to_message.audio || message.reply_to_message.voice) &&
        associations[message.reply_to_message.message_id]
      ) {
        associations[message.reply_to_message.message_id].title = message.text;
      } else {
        associations[message.message_id] = {
          idx,
          title: message.text,
          audio: null,
        };
      }
    } else if (message.audio || message.voice) {
      // Handle audio messages
      if (
        message.reply_to_message &&
        message.reply_to_message.text &&
        associations[message.reply_to_message.message_id]
      ) {
        associations[message.reply_to_message.message_id].audio =
          message.audio || message.voice;
      } else {
        associations[message.message_id] = {
          idx,
          title: null,
          audio: message.audio || message.voice,
        };
      }
    }

    idx++;
  }

  let results = Object.values(associations);
  results.sort((a, b) => a.idx - b.idx);

  for (let i = 0; i < results.length - 1; i++) {
    const item = results[i];
    const nextItem = results[i + 1];

    if (!item.audio && !nextItem.title) {
      // associate them
      nextItem.title = item.title;

      // skip next
      i++;
    }
  }

  results = results.filter((it) => it.title && it.audio);

  saveResultList(results);

  const lastItem = results[results.length - 1];

  for (const item of results) {
    const audio = item.audio;

    // Download the audio file
    try {
      const fileName = await downloadFile(
        audio.file_id,
        audio.file_unique_id,
        audio.mime_type
      );

      item.audio_file = fileName;

      saveResultList(results);

      console.log(`Complete: ${item.idx} / ${lastItem.idx}`);
    } catch (error) {
      console.error(`Failed to download audio file: ${error.message}`);
      console.error(error.stack);
    }
  }

  console.log("Processing complete.");
})();
