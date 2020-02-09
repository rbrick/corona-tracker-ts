import cheerio from 'cheerio';
import fs from 'fs';
import https from 'https';
import Telegraf from 'telegraf';

const second = 1000;
const minute = 60 * second;

const key = process.env.TG_BOT_TOKEN as string;
const channel = process.env.TG_CHANNEL_NAME as string;

const pattern = /([0-9]+,?[0-9]+)/g;

const escape = (str: string, charset: string): string => {
    var newS = ""; // create a new string
    for (var i = 0; i < str.length; i++) {
        // check if the current character is within the charset
        if (charset.indexOf(str[i]) != -1) {
            newS += "\\"; // append the escape string
        }
        newS += str[i] // append the character
    }
    return newS;
}

let recentCases = 0, recentDeaths = 0;

const scrape = async (callback?: (cases: number, death: number) => void) => {
    https.get("https://bnonews.com/index.php/2020/02/the-latest-coronavirus-cases/", (response) => {
        let data = '';

        // collect the data
        response.on('data', (chunk) => data += chunk);

        // when we're done collecting being to parse
        response.on('end', () => {
            // use cheerio to load & parse the data
            const $ = cheerio.load(data);

            // search for the content we're looking for
            $("div #mvp-content-main p").toArray().forEach(element => {
                element.children.forEach(child => {
                    // ensure it is the correct type 
                    if (child.type == "tag" && child.name == "strong" && child != undefined) {
                        const message = child.firstChild.data as string;
                        let data: number[] = [];

                        // match the regex
                        var match = pattern.exec(message);
                        do {
                            if (match) {
                                data.push(Number.parseInt(match[0].replace(",", "")));
                            }
                            match = pattern.exec(message);
                        } while (match);

                        // call back to the function before
                        if (callback) {
                            callback(data[0], data[1]);
                        }
                    }
                });
            })
        });
    });
}

const init = () => {
    console.log("initializing...");
    // check if the last record exists
    if (fs.existsSync("latestRecord")) {
        console.log("loading previous data");
        // read the latest record file
        fs.readFile("latestRecord", (err, data) => {
            var contents = data.toString().split(",");

            // set the recent cases to what was found in the file
            recentCases = Number.parseInt(contents[0]);
            // set the recent deaths to what was found in file
            recentDeaths = Number.parseInt(contents[1]);
            console.log("previous data loaded");
        });
    }


    main();
}

const main = () => {
    let bot = new Telegraf(key);
    console.log("initialized telegram bot");
    // set an interval to run every 5 minutes
    setInterval(async () => {
        // scrape the page
        scrape((cases, deaths) => {

            // format the string
            let casesDiff = cases - recentCases, deathsDiff = deaths - recentDeaths;
            if (casesDiff > 0 || deathsDiff > 0) {
                console.log("updated detected sending message...");
                let now = new Date();
                let msg = `❗*Coronavirus Updates*❗\n\n*Total Cases: ${cases.toLocaleString()} (${(casesDiff >= 0 ? "+" : "")}${casesDiff})
            *\n*Total Deaths: ${deaths.toLocaleString()} (${(deathsDiff >= 0 ? "\+" : "")}${deathsDiff})*\n*Last Updated: ${now.toLocaleDateString()} ${now.toTimeString()}*\n\n@CoronavirusStatNews`;

                recentCases = cases, recentDeaths = deaths;
                // write to local cache
                fs.writeFile("latestRecord", `${cases},${deaths}`, () => { /* ignored */ });
                // send a message!
                bot.telegram.sendMessage(`@${channel}`, escape(msg, "_[]()~`>#+-=|{}.!"), { parse_mode: "MarkdownV2", disable_notification: !(casesDiff >= 200 || deathsDiff >= 200) });

                console.log("message sent!");
            }
        })
    }, 5 * minute);

    console.log("polling every 5 minutes");
}

init();

