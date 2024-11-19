const { Telegraf } = require('telegraf');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);

// Replace with your group chat ID (e.g., -123456789)
const groupChatId = process.env.GROUP_CHAT_ID;

const downloadDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadDir)) {
  fs.mkdirSync(downloadDir);
}

// The list to maintain the data
let resultList = [];
let textMessagesQueue = [];

// Function to download the audio file
async function downloadFile(fileId, fileUniqueId, mimeType) {
  const file = await bot.telegram.getFile(fileId);
  const fileUrl = `https://api.telegram.org/file/bot${botToken}/${file.file_path}`;
  const fileExtension = mimeType && mimeType.includes('ogg') ? '.ogg' : '.mp3';
  const fileName = path.join(
    downloadDir,
    `${fileUniqueId}_${Date.now()}${fileExtension}`
  );

  const response = await axios({
    url: fileUrl,
    method: 'GET',
    responseType: 'stream',
  });

  const writer = fs.createWriteStream(fileName);

  response.data.pipe(writer);

  await new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

  return fileName;
}

// Function to save the resultList to a JSON file
function saveResultList() {
  const outputFile = path.join(__dirname, 'result_list.json');
  fs.writeFileSync(outputFile, JSON.stringify(resultList, null, 2));
  console.log(`Result list saved to ${outputFile}`);
}

// Main function to process updates from updates.json
(async () => {
  // Load updates from the JSON file
  const updatesData = fs.readFileSync('updates.json', 'utf-8');
  const allUpdates = JSON.parse(updatesData);

  console.log(`Processing ${allUpdates.length} updates.`);

  // Process the updates
  for (const update of allUpdates) {
    if (update.message) {
      const message = update.message;

      if (message.chat && message.chat.id === groupChatId) {
        if (message.text) {
          // Handle text messages
          if (
            message.reply_to_message &&
            (message.reply_to_message.audio || message.reply_to_message.voice)
          ) {
            // The text message is a reply to an audio message
            const audioMessageId = message.reply_to_message.message_id;

            // Find the audio message in resultList
            const audioItem = resultList.find(
              (item) => item.audio_message.message_id === audioMessageId
            );

            if (audioItem) {
              // Associate the title
              audioItem.title = message.text;
              saveResultList();
            } else {
              // If we didn't find the audio message
              console.log('Audio message not found for reply text.');
            }
          } else {
            // Store the text message to associate with the next audio message
            textMessagesQueue.push(message);
          }
        } else if (message.audio || message.voice) {
          // Handle audio messages
          const audio = message.audio || message.voice;
          let title = '';

          if (message.reply_to_message && message.reply_to_message.text) {
            // The audio message is a reply to a text message
            title = message.reply_to_message.text;
          } else if (textMessagesQueue.length > 0) {
            // Associate with the earliest unassociated text message
            const textMessage = textMessagesQueue.shift();
            title = textMessage.text;
          }

          // Download the audio file
          try {
            const fileName = await downloadFile(
              audio.file_id,
              audio.file_unique_id,
              audio.mime_type
            );

            // Add to the result list
            const audioItem = {
              title: title,
              audio_message: message,
              audio_file: fileName,
            };

            resultList.push(audioItem);
            saveResultList();
          } catch (error) {
            console.error(`Failed to download audio file: ${error.message}`);
          }
        }
      }
    }
  }

  console.log('Processing complete.');
})();
