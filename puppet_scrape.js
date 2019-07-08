const puppet = require('puppeteer');

module.exports = async function puppet_scrape(spinner, ref_number) {

  const browser = await puppet.launch();
  const page = await browser.newPage();
  await page.goto('https://www.wandsworth.gov.uk/planning-and-building-control/search-planning-applications/');
  await page.select('#cboStreetReferenceNumber', ref_number);
  await page.click('#csbtnSearch');
  await page.waitForSelector('#lblPagePosition');
  
  // We need to figure out how many pages we're going to need to flip
  var total_handle = await page.$('#lblPagePosition');
  var total_str = await page.evaluate(total_handle => total_handle.textContent, total_handle);
  var total_arr = total_str.split(' ');
  var total = parseInt(total_arr[total_arr.length-1]);
  console.log('Successfully opened browser');
  // total is now the total number of elements
  var pages = Math.ceil(total / 10);
  // pages is now the number of pages we have total

  // we init our page counter to page 2 because we start
  // on page 1
  var page_num = 2;

  // Init the "book" of href pages that we're going to return
  var book = [];

  // Before we start flipping, let's get the links from the first page
  await page.waitForSelector('td.TableData a.data_text');
  spinner.text = 'Now getting our data!';

  // Create the first "page" of links
  var hrefs = await page.evaluate(() => {
    const anchors = document.querySelectorAll('td.TableData a.data_text');
    return [].map.call(anchors, a => { return { link: a.href, app_number: a.textContent }});
  });

  // Add that "page" to the "book" of all the links
  book.push(...hrefs);

  spinner.color = 'green';
  spinner.text = 'Collecting data from web pages';
  while(page_num <= pages){
    
    spinner.text = `Scraping page ${page_num} of ${pages}`;

    try {

      // Go to the next page
      await page.waitForSelector(`[title="Goto Page ${page_num}"]`);
      await page.click(`[title="Goto Page ${page_num}"]`);

      // Collect hrefs
      await page.waitForSelector('td.TableData a.data_text');
      hrefs = await page.evaluate(() => {
        const anchors = document.querySelectorAll('td.TableData a.data_text');
        return [].map.call(anchors, a => { return { link: a.href, app_number: a.textContent }});
      });

      // Push hrefs to "book"
      book.push(...hrefs);

      page_num++;

    } catch(err) {

      console.log(err);
      break;

    }

  }
  
  // Close browser
  browser.close();

  // Return book of hrefs
  return book;

};