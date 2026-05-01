const { scrapeOSINT } = require('./src/services/osintScraper');

(async () => {
  console.log('Testing OSINT Scraper...');
  const result = await scrapeOSINT('Akhmad Zamri Ardani', 'Universitas Muhammadiyah Malang');
  console.log('Result:', JSON.stringify(result, null, 2));
})();
