const { Telegraf } = require("telegraf");
let axios = require("axios");
const fs = require("fs");
const path = require("path");
const { HttpsProxyAgent } = require("https-proxy-agent");
require("dotenv").config();

let proxyAgent;
if (process.env.https_proxy) {
  proxyAgent = new HttpsProxyAgent(process.env.https_proxy);
  axios = axios.create({ httpsAgent: proxyAgent });
}

const bot = new Telegraf(process.env.BOT_TOKEN, {
  telegram: proxyAgent
    ? {
        agent: proxyAgent,
      }
    : undefined,
});

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
async function downloadFile(fileId, fileUniqueId, mimeType, fileSize) {
  const fileExtension = mimeType && mimeType.includes("ogg") ? ".ogg" : ".mp3";
  const fileName = path.join(downloadDir, `${fileUniqueId}${fileExtension}`);

  try {
    fs.accessSync(fileName, fs.constants.R_OK);

    if (fileSize) {
      // console.log(fs.statSync(fileName).size, fileSize);
      if (fs.statSync(fileName).size === fileSize) {
        return fileName;
      }
    } else {
      return fileName;
    }
  } catch (e) {
    // console.error(e);
  }

  const file = await bot.telegram.getFile(fileId);
  const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;

  const response = await axios({
    url: fileUrl,
    method: "GET",
    responseType: "stream",
    beforeRedirect: (options, { headers, statusCode }) => {
      console.log(statusCode);
      console.log(headers);
    },
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

    if (!(message.audio || message.voice)) {
      const text = message.text || "UNKNOWN";
      // Handle text messages
      if (
        message.reply_to_message &&
        (message.reply_to_message.audio || message.reply_to_message.voice)
      ) {
        if (associations[message.reply_to_message.message_id]) {
          associations[message.reply_to_message.message_id].title = text;
          associations[message.reply_to_message.message_id].by_reply = true;
          // console.error("reply ok");
        } else {
          console.error("reply to ghost 1");
        }
      } else {
        associations[message.message_id] = {
          idx,
          title: text,
          audio: [],
        };
      }
    } else if (message.audio || message.voice) {
      // Handle audio messages
      if (message.reply_to_message && message.reply_to_message.text) {
        if (associations[message.reply_to_message.message_id]) {
          associations[message.reply_to_message.message_id].audio = [message];
          associations[message.reply_to_message.message_id].by_reply = true;
          // console.error("reply ok");
        } else {
          console.error("reply to ghost 2");
        }
      } else if (
        message.reply_to_message &&
        (message.reply_to_message.audio || message.reply_to_message.voice)
      ) {
        if (associations[message.reply_to_message.message_id]) {
        } else {
          const item = Object.values(associations).find((it) =>
            it.audio.find(
              (m) => m.message_id === message.reply_to_message.message_id
            )
          );
          if (item) {
            item.audio.push(message);
            item.by_reply = true;
          } else {
            console.error("reply to ghost 3");
          }
        }
      } else {
        associations[message.message_id] = {
          idx,
          title: message.caption || null,
          audio: [message],
        };
      }
    }

    idx++;
  }

  let results = Object.values(associations);
  results.sort((a, b) => a.idx - b.idx);

  function extractDate(audio) {
    return audio.forward_origin ? audio.forward_origin.date : audio.date;
  }

  function isComplete(item) {
    return item && item.title && item.audio.length;
  }

  function isEmpty(item) {
    return item && !item.title && !item.audio.length;
  }

  function isCompleteOrEmpty(item) {
    return item && (isComplete(item) || isEmpty(item));
  }

  for (let i = 0; i < results.length; i++) {
    const item = results[i];
    const prevItem = results[i - 1];
    const nextItem = results[i + 1];

    if (item.title && !item.audio.length) {
      if (nextItem && !nextItem.title && nextItem.audio.length) {
        item.audio = nextItem.audio;
        nextItem.audio = [];
      } else if (prevItem && !prevItem.title && prevItem.audio.length) {
        item.audio = prevItem.audio;
        prevItem.audio = [];
      } else {
        console.log("orphan 1");
      }
    }

    if (!item.title && item.audio.length) {
      if (isCompleteOrEmpty(prevItem) && isCompleteOrEmpty(nextItem)) {
        console.log("orphan 2");
      } else if (
        isCompleteOrEmpty(prevItem) &&
        nextItem &&
        nextItem.title &&
        !nextItem.audio.length // next is a title message
      ) {
        // choose next
        nextItem.audio.push(...item.audio);
        item.audio = [];
      } else if (
        isCompleteOrEmpty(nextItem) &&
        prevItem &&
        prevItem.title &&
        !prevItem.audio.length // prev is a title message
      ) {
        // choose prev
        prevItem.audio.push(...item.audio);
        item.audio = [];
      } else {
        if (isEmpty(prevItem)) {
          let found = false;
          // backtrack join
          for (let b = i - 2; b > 0; b--) {
            const backtrackItem = results[b];
            if (backtrackItem.title && !backtrackItem.audio.length) {
              break;
            }

            if (backtrackItem.title && backtrackItem.audio.length) {
              backtrackItem.audio.push(...item.audio);
              item.audio = [];
              found = true;
              break;
            }
          }

          if (!found) {
            console.log("orphan 3");
          }
        } else if (
          isComplete(prevItem) &&
          nextItem &&
          !nextItem.title &&
          nextItem.audio.length // next is audio
        ) {
          // forwardtrack join
          const accumulator = [];
          for (let f = i; f < results.length; f++) {
            const forwardtrackItem = results[f];
            if (forwardtrackItem.title && forwardtrackItem.audio.length) {
              break;
            }

            if (forwardtrackItem.title && !forwardtrackItem.audio.length) {
              forwardtrackItem.audio = accumulator;
              found = true;
              break;
            } else {
              accumulator.push(...forwardtrackItem.audio);
              forwardtrackItem.audio = [];
            }
          }

          if (!found) {
            console.log("orphan 4");
          }
        }
      }
    }
  }

  // results = results.filter(
  //   (it) => (it.title && it.audio.length) || (!it.title && it.audio.length)
  // );

  // for (let i = 0; i < results.length; i++) {
  //   const item = results[i];
  //   const prevItem = results[i - 1];
  //   const nextItem = results[i + 1];

  //   if (!item.title && item.audio.length) {
  //     // voice adjacent to voice
  //     if (nextItem && nextItem.title && nextItem.audio.length) {
  //       nextItem.audio.push(...item.audio);
  //       item.audio = [];
  //     } else if (prevItem && prevItem.title && prevItem.audio.length) {
  //       prevItem.audio.push(...item.audio);
  //       item.audio = [];
  //     }
  //   }
  // }

  results = results.filter((it) => it.title && it.audio.length);

  saveResultList(results);

  const lastItem = results[results.length - 1];

  for (const item of results) {
    const audio_list = item.audio.map((item) => item.audio || item.voice);
    const downloads = [];

    for (const audio of audio_list) {
      // Download the audio file
      try {
        const fileName = await downloadFile(
          audio.file_id,
          audio.file_unique_id,
          audio.mime_type,
          audio.file_size
        );

        downloads.push(fileName);
      } catch (error) {
        console.error(`Failed to download audio file: ${error.message}`);
        // console.error(error.stack);
        // console.error(audio);
      }
    }

    item.audio_file = downloads;
    saveResultList(results);
    console.log(`Complete: ${item.idx} / ${lastItem.idx}`);
  }

  results = results
    .map((r) => ({ ...r }))
    .map((r) => {
      delete r.audio;
      return r;
    });

  saveResultList(results);

  console.log("Processing complete.");
})();
