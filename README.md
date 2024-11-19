# Audio and Title Pairing for Telegram

I'm busy with a podcast project, the audio/voices and their titles are sent to a telegram group, I don't have the time or human labour to pair them so I started this project to assist me with the task.

The titles are not perfectly aligned with the audio files, sometimes they're before sometimes they're after the audio message, also there are sometimes stacks of audio messages before or after the title, so this project can handle these cases.

## How To Run

Create your bot and don't forget to use `/setprivacy` in BotFather to disable it for the bot.

Create a new group (bot can't access previous messages), add the bot to the group then forward all the titles and audios to the new group.

Use [this link](https://stackoverflow.com/questions/72640703/telegram-how-to-find-group-chat-id) to find your group id.

### Environment File (.env)

```
BOT_TOKEN=""
GROUP_CHAT_ID=""
```

### Commands

create `out` directory.

run `node store_updates.js`.

run `node process_updates.js`.

Done!, your messages are now paired in **result_list.json**!
