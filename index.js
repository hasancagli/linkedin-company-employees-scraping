var airtable = require('airtable');
const puppeteer = require('puppeteer');
require('dotenv').config()

// Defining API_KEY and BASE variables for Airtable
const API_KEY = process.env.API_KEY;
const BASE = process.env.BASE;

// Creating Airtable Objects to Access Database
const base = new airtable({ apiKey: API_KEY }).base(BASE);
const baseCreate = new airtable({ apiKey: API_KEY }).base(BASE);

const promises = [];
// Get All Company URLs with Promise Object
var getBase = new Promise((res) => {
    base("Company").select({}).eachPage((records, next) => {
        records.forEach(record => {
            promises.push(
                new Promise((resolve) => {
                    resolve(record.fields);
                })
            )
        });
        // Returning companyURLs
        Promise.all(promises).then((companyURLs) => {
            res(companyURLs);
        })
    })
})


getBase.then(urls => {
    // For loop for Company URLs
    urls.forEach(item => {
        let url = item["Company URL"];
        console.log(url);

        (async () => {
            // Setting Browser
            const browser = await puppeteer.launch({ headless: false, slowMo: 250 });
            const page = await browser.newPage();

            // Logging in to Linkedin Account with Cookies
            await page.setCookie({
                'name': 'li_at',
                'value': '<YOUR_AUTHENTICATION_VALUE>',
                'domain': '.www.linkedin.com'
            })

            // Go to Company Profile
            await page.goto(url);

            // Find "See all Employees" Text and Click
            const element = await page.$x('//*[@id="main"]/div[1]/section/div/div[2]/div[1]/div[2]/div/a')
            await element[0].click()

            // Wait for Page Load
            await page.waitForXPath('//*[@id="main"]/div/div/div[2]/ul/li[1]/div/div/div[2]/div/div[1]/div/span/span/a');

            // Get Company Employees Count
            const memberCountText = await page.$x('//*[@id="main"]/div/div/div[1]');
            let memberCount = await page.evaluate(h1 => h1.textContent, memberCountText[0]);
            let memberCountTextSplit = memberCount.trim().split(" ");

            // Find the count of pages that we need to access for all list of employees
            var count = parseInt(memberCountTextSplit[0]);
            var clickCount = 0;
            if (count % 10 == 0) {
                clickCount = (count / 10) - 1
            } else {
                clickCount = Math.floor(count / 10.0)
            }

            // For loop in pages of search
            for (var x = 0; x <= clickCount; x++) {
                let pageValues = []; // Defining a list to push company members' informations in
                await page.goto(page.url() + '&page=' + (x + 1).toString()) // Going to the "page url + page number"
                await page.waitForXPath('//*[@id="main"]/div/div/div[2]/ul/li[1]/div/div/div[2]/div/div[1]/div/span/span/a');
                for (var i = 1; i < 11; i++) {
                    // Getting name, title and location values of company employee
                    const name = await page.$x('//*[@id="main"]/div/div/div[2]/ul/li[' + i.toString() + ']/div/div/div[2]/div/div[1]/div/span/span/a')
                    const title = await page.$x('//*[@id="main"]/div/div/div[2]/ul/li[' + i.toString() + ']/div/div/div[2]/div/div[2]/div/div[1]')
                    const location = await page.$x('//*[@id="main"]/div/div/div[2]/ul/li[' + i.toString() + ']/div/div/div[2]/div/div[2]/div/div[2]')

                    let nameText = "";
                    let titleText = "";
                    let locationText = "";
                    let profileURL = "";

                    // Getting texts' textContent via defining new elements
                    nameText = await page.evaluate(h1 => h1.textContent, name[0]).catch((error) => {
                        return "";
                    });
                    titleText = await page.evaluate(h1 => h1.textContent, title[0]).catch((error) => {
                        return "";
                    });
                    locationText = await page.evaluate(h1 => h1.textContent, location[0]).catch((error) => {
                        return "";
                    });
                    profileURL = await page.evaluate(h1 => h1.href, name[0]).catch((error) => {
                        return "";
                    });

                    // Creating an object to store employee informations
                    let object = {
                        "name": (nameText.trim() == "LinkedIn Member") ? nameText.trim() : nameText.trim().split("View")[0],
                        "title": (!(typeof titleText == undefined)) ? titleText.trim() : '',
                        "location": (!(typeof locationText == undefined)) ? locationText.trim() : '',
                        "profileURL": (!(typeof profileURL == undefined)) ? profileURL.trim() : '',
                        "companyURL": (!(typeof url == undefined)) ? url.trim() : '',
                    };

                    console.log(object);
                    pageValues.push(object); // Push the object to pageValues list

                }

                // We have all the employees' informations of page "x" in pageValues list
                for (var y = 0; y < pageValues.length; y++) {
                    let exists = false;
                    // Check if employee exists in airtable or not
                    await base("People").select({
                        filterByFormula: "AND({Name}='" + pageValues[y]["name"] + "'" + ",{Title}='" + pageValues[y]["title"] + "'" + ",{Location}='" + pageValues[y]["location"] + "'" + ")"
                    }).eachPage((records, next) => {
                        if (!(records.length > 0)) {
                            exists = true;
                        }
                        try {
                            next();
                        } catch (err) {
                            console.log("ERROR")
                        }


                    }).catch(errr => {
                        console.log("Error Occured with first base.")
                    })

                    // If employee doesn't exist in airtable database, create new employee data
                    if (exists && pageValues[y]["name"] != "") {
                        baseCreate("People").create([
                            {
                                fields: {
                                    Name: pageValues[y]["name"],
                                    Title: pageValues[y]["title"],
                                    Location: pageValues[y]["location"],
                                    URL: pageValues[y]["profileURL"],
                                    CompanyURL: pageValues[y]["companyURL"]
                                }
                            }
                        ], function (err, records) {
                            if (err) {
                                console.log("Error Occured.")
                            }
                        })
                    }

                }
            }
            setTimeout(() => {
                browser.close();
            }, 5000)
        })();
    })
})