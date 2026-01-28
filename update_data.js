const fs = require('fs');
const https = require('https');

// Read GAS URL from script.js
const scriptContent = fs.readFileSync('script.js', 'utf8');
const match = scriptContent.match(/const GAS_API_URL = "(.*?)";/);

if (!match || !match[1] || match[1].includes("YOUR_GAS_WEB_APP_URL")) {
    console.error("Error: Could not find valid GAS_API_URL in script.js");
    process.exit(1);
}

const GAS_API_URL = match[1];
const TARGET_FILE = 'data.js';

console.log(`Fetching config from: ${GAS_API_URL}...`);

https.get(`${GAS_API_URL}?type=config`, (res) => {
    // Handle redirects (GAS web apps often redirect)
    if (res.statusCode === 302 || res.statusCode === 307) {
        console.log(`Following redirect to: ${res.headers.location}`);
        https.get(res.headers.location, (redirectRes) => {
            processResponse(redirectRes);
        });
    } else {
        processResponse(res);
    }
}).on('error', (e) => {
    console.error(`Link error: ${e.message}`);
});

function processResponse(res) {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        try {
            // Verify it's valid JSON
            const json = JSON.parse(data);
            if (!json.products || !json.settings) {
                throw new Error("Invalid data structure received");
            }

            // Write to file
            const fileContent = `const PRELOADED_CONFIG = ${JSON.stringify(json, null, 2)};`;
            fs.writeFileSync(TARGET_FILE, fileContent);
            console.log(`✅ Successfully updated ${TARGET_FILE}!`);
            console.log("Your website will now load instantly with this data.");
        } catch (e) {
            console.error("Error parsing JSON:", e.message);
            console.log("Raw Response:", data);
        }
    });
}
