const axios = require("axios");
const fs = require("fs");
const path = require("path");
const getRawBody = require("raw-body");

module.exports = async (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    } else {
      return res.sendStatus(403);
    }
  }

  if (req.method === "POST") {
    try {
      const rawBody = await getRawBody(req);
      const body = JSON.parse(rawBody.toString());

      if (body.object === "page") {
        for (const entry of body.entry) {
          const webhookEvent = entry.messaging[0];
          const senderId = webhookEvent.sender.id;

          if (webhookEvent.message && webhookEvent.message.text) {
            const url = webhookEvent.message.text;

            if (url.startsWith("http")) {
              try {
                const filename = path.basename(url.split("?")[0]);
                const filepath = `/tmp/${filename}`;
                const writer = fs.createWriteStream(filepath);
                const response = await axios({ url, method: "GET", responseType: "stream" });

                response.data.pipe(writer);

                await new Promise((resolve, reject) => {
                  writer.on("finish", resolve);
                  writer.on("error", reject);
                });

                await axios.post(
                  `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
                  {
                    recipient: { id: senderId },
                    message: { text: `✅ تم تحميل الملف: ${filename}` }
                  }
                );
              } catch (error) {
                await axios.post(
                  `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
                  {
                    recipient: { id: senderId },
                    message: { text: `❌ فشل التحميل: ${error.message}` }
                  }
                );
              }
            }
          }
        }
        return res.sendStatus(200);
      } else {
        return res.sendStatus(404);
      }
    } catch (err) {
      return res.status(500).send("Error parsing request body");
    }
  }

  res.sendStatus(405); // Method Not Allowed
};