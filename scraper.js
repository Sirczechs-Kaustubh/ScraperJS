const { chromium } = require('playwright');
const fs = require('fs');
const readline = require('readline');
const { parse } = require('json2csv');
const { Parser } = require('json2csv');

async function fetchCompanyDetails(url) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const data = [];

  try {
    await page.goto(url);

    const entries = await page.$$('.postEntry');

    for (const entry of entries) {
      const companyName = await entry.$eval('h2', el => el.textContent.trim());
      
      const phone = await entry.$eval('li:has-text("Phone:")', el => 
        el.textContent.replace('Phone:', '').trim()
      ).catch(() => 'Not available');

      const website = await entry.$eval('a', el => el.href)
        .catch(() => 'Not available');

      const country = await entry.getAttribute('data-country') || 'Not specified';

      const panelType = await entry.$eval('li:has-text("Type:")', el => 
        el.textContent.replace('Type:', '').trim()
      ).catch(() => 'Not specified');

      data.push({
        'Company Name': companyName,
        'Phone': phone,
        'Website': website,
        'Country': country,
        'Type': panelType
      });
    }
  } catch (error) {
    console.error("Failed to retrieve the webpage:", error);
  } finally {
    await browser.close();
  }

  return data;
}


async function fetchEmailsFromWebsites(csvData) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const emailData = [];

  for (const entry of csvData) {
    if (entry.Website && entry.Website !== 'Not available') {
      try {
        await page.goto(entry.Website, { waitUntil: 'domcontentloaded' });

        const emails = await page.evaluate(() => {
          const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
          const bodyText = document.body.innerText;
          const emails = bodyText.match(emailRegex) || [];
          return emails.filter(email => !email.includes('.png') && !email.includes('.jpg'));
        });

        emailData.push({
          'Website': entry.Website,
          'Emails': emails.join(', ')
        });
      } catch (error) {
        console.error('Failed to retrieve emails from ${entry.Website}:', error);
        emailData.push({
          'Website': entry.Website,
          'Emails': 'Failed to retrieve'
        });
      }
    } else {
      emailData.push({
        'Website': entry.Website,
        'Emails': 'No website available'
      });
    }
  }

  await browser.close();
  return emailData;
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Please enter the URL to scrape: ', (url) => {
  fetchCompanyDetails(url).then(async data => {
    const csvData = parse(data, { header: true });
    fs.writeFileSync('company_details.csv', csvData);
    console.log('Data has been saved to company_details.csv');

    const emailData = await fetchEmailsFromWebsites(data);
    const emailCsv = parse(emailData, { header: true });
    fs.writeFileSync('email_details.csv', emailCsv);
    console.log('Emails have been saved to email_details.csv');

    rl.close();
  }).catch(error => {
    console.error('An error occurred:', error);
    rl.close();
  });
});