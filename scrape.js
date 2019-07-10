const cheerio = require('cheerio');
const url = require('url');
const rp = require('request-promise');
const ss = require('string-similarity');
const ps = require('./puppet_scrape');
const path = require('path');
const mkdirp = require('mkdirp');
const fs = require('fs');
const download = require('download');

module.exports = async function scrape(spinner, code, address, current_dir){

    // Wrapper
    try {

        const entry_url = 'https://www.gov.uk/search-register-planning-decisions'; // entry point uri

        // Build options
        var options = {
            uri: entry_url,
            method: 'POST',
            form: { postcode: code },
            transform: function(body){
                return cheerio.load(body);
            },
            followAllRedirects: true // we need to follow POST request redirect
        };

        // @POST
        // link: "https://www.gov.uk/search-register-planning-decisions"
        var $ = await rp(options);

        // Extract "Go to their website" link
        var visit_site_link = $('#get-started a')[0].attribs.href; // extract specific site href

        // Modify options for next request
        options.uri = visit_site_link;
        options.method = 'GET';
        options.form = {};
        options.followAllRedirects = false;

        // @GET
        // link: "Go to their website"
        var $ = await rp(options);


        // WARNING!!!!!
        // This is the point in the code where you might be taken to a different URL
        // than expected if your postcode does not go to the following URL:
        // https://www.wandsworth.gov.uk/planning


        // Build "Search for planning applications" uri from a[href] and old protocol/hostname
        var search_planning_apps_uri = 'https://' + url.parse(options.uri).hostname + $('.task')[0].attribs.href;

        // Build options
        options.uri = search_planning_apps_uri;

        // method: @GET
        // link: "Search for planning applications"
        delete options.transform;
        options.resolveWithFullResponse = true;
        var body = await rp(options);
        var $ = cheerio.load(body.body);

        // Extract selectable elements
        var obj_collection = $('#cboStreetReferenceNumber')[0].children;
        var collection = []; // array of inner strings for each select element

        // Push innerHTML strings to collection
        for(let i=0; i<obj_collection.length; i++){
            try {
                collection.push(obj_collection[i].children[0].data);
            } catch(e) {
                collection.push('');
            }
        }

        // Find the best match for our given address
        var matches = ss.findBestMatch(address, collection);
        var cboStreetReferenceNumber = obj_collection[matches.bestMatchIndex].attribs.value;

        // input: cboStreetReferenceNumber for <select> on next page
        // returns: an array of urls for all the applications
        spinner.text = 'Opening headless browser...';
        var app_links = await ps(spinner, cboStreetReferenceNumber);
        spinner.color = 'yellow';
        spinner.text = `Downloading ${app_links.length} application links.`;

        // Modify options
        delete options.form;
        delete options.followAllRedirects;
        delete options.resolveWithFullResponse;
        options.transform = function(body){
            return cheerio.load(body);
        }

        // Loop through each application and download documents
        for([index, app] of app_links.entries()){

            spinner.text = `${parseFloat(index / app_links.length) * 100}% complete...`;

            // Set uri to the current application uri
            options.uri = app.link;
            
            // Create a subfolder for this application
            var app_dir = path.join(current_dir, `/${app.app_number.replace(/\//g,'-')}`);
            mkdirp(app_dir);

            // Make request to application
            var $ = await rp(options);

            // Save this page as .html file
            fs.writeFile(path.join(app_dir, 'View Application Details.html'), $.html(), err => {
                if(err) {
                    console.log(`Unable to write file for application code ${app.app_number}.`);
                    throw new Error(err);
                }
            })

            // View related documents
            options.uri = $('b a[title="Link to View Related Documents"]')[0].attribs.href;
            var $ = await rp(options);

            // Save this page as .html file
            fs.writeFile(path.join(app_dir, 'View drawings, comments and other documents.html'), $.html(), err => {
                if(err) {
                    console.log(`Unable to write file for application code ${app.app_number}.`);
                    throw new Error(err);
                }
            })
            
            // Find all the 'Whole Doc' links
            var pdf_obj = $('td a');
            var pdf_links = [];
            var base = 'https://planning.wandsworth.gov.uk';
            for(let i=0; i<pdf_obj.length; i++){
                if(pdf_obj[i].children[0].data == 'Whole Doc'){
                    var raw = pdf_obj[i].attribs.href;
                    pdf_links.push(`${base}${raw}`.replace(' ', '%20'));
                }
            }

            // Download all pdfs and place in app directory
            Promise.all(pdf_links.map(async link => {
                download(link, app_dir);
            }))

        }

    } catch(e) {
        console.log(e);
        throw new Error({code, address});
    }

}

