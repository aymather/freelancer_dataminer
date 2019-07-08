const mkdirp = require('mkdirp');
const fs = require('fs');
const path = require('path');
const scrape = require('./scrape');
const ora = require('ora');

var spinner = ora('Starting...').start();

// Read in starting data [POST CODE | ADDRESS]
const file = fs.readFileSync('input.json');
const data = JSON.parse(file);

// Global variables
const CWD = process.cwd(); // working directory

// Backup
var backup = [];

// Entry point
async function main(){

    // Loop through post codes
    for(obj of data){

        // Gather starting variables
        var code = obj.code;
        var address = obj.address;
		var folder_title = `${code}-${address}`;
		
		spinner.color = 'blue';
		spinner.text = `Starting with postcode: ${code} | address: ${address}`;

        // Create a folder for current process
        mkdirp(path.join(CWD, `/${folder_title}`));

        // Attempt to gather data from current process
        try {

            await scrape(spinner, code, address, path.join(CWD, `/${folder_title}`));

        } catch(e) {
            console.log('We got an error.');
            // If we get an error, store the process in
            // an object to try again when we finish,
            // the website might just be busy.
			backup.push(obj);
			// do something with the backup if you want
        }

	}// End loop through post codes
	
} // End entry point

(async () => {
	await main();
	spinner.stop();
	console.log('Finished! :)');
})();